import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  getPublicPushConfig,
  getPushStatus,
  getSubscriptionId,
  isValidPushSubscription,
  removePushSubscription,
  runPushDispatchCheck,
  sendWebPushNotification,
  startServerPushLoop,
  upsertPushSubscription
} from './server/pushService';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '256kb' }));

// Initialize Gemini API client lazily or safely
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Healthcheck API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'UTTiST Relief Driver Helper' });
});

// Web Push: public VAPID config
app.get('/api/push/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getPublicPushConfig());
});

// Web Push: diagnostics & cron status
app.get('/api/push/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
    const subIdParam = typeof req.query.subId === 'string' ? req.query.subId : '';
    const subId = endpoint ? getSubscriptionId(endpoint) : subIdParam;
    const status = await getPushStatus(subId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Status error' });
  }
});

// Web Push: subscribe & sync scheduled points
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { subscription, enabled, vehicleId, garageNumber, items } = req.body || {};
    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Некорректная push-подписка браузера' });
    }
    const result = await upsertPushSubscription({
      subscription,
      enabled: Boolean(enabled),
      vehicleId,
      garageNumber,
      items
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Error in /api/push/subscribe:', err);
    res.status(500).json({ error: err?.message || 'Ошибка сохранения подписки' });
  }
});

// Web Push: unsubscribe
app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return res.status(400).json({ error: 'Некорректный endpoint' });
    }
    const result = await removePushSubscription(endpoint);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка отписки' });
  }
});

// Web Push: immediate server push test
app.post('/api/push/test', async (req, res) => {
  try {
    const { subscription, title, body } = req.body || {};
    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Push-подписка не найдена или некорректна' });
    }
    const safeTitle = typeof title === 'string' && title.trim() ? title.slice(0, 120) : 'Подмена — Проверка Push';
    const safeBody =
      typeof body === 'string' && body.trim()
        ? body.slice(0, 200)
        : 'Серверный Push работает! Уведомления приходят и при выключенном экране.';

    const result = await sendWebPushNotification(subscription, {
      id: `test-push-${Date.now()}`,
      tag: 'podmena-test-push',
      title: safeTitle,
      body: safeBody,
      url: '/'
    });

    if (result.gone) {
      await removePushSubscription(subscription.endpoint);
      return res.status(410).json({ ok: false, gone: true, error: result.error });
    }
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Ошибка отправки теста' });
  }
});

// Web Push: delayed lock-screen test (allows user to lock phone screen within 10s)
app.post('/api/push/test-delayed', (req, res) => {
  try {
    const { subscription, title, body, delayMs } = req.body || {};
    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Push-подписка не найдена или некорректна' });
    }
    const clampedDelay = Math.min(30000, Math.max(2000, Number(delayMs) || 10000));
    const safeTitle =
      typeof title === 'string' && title.trim()
        ? title.slice(0, 120)
        : 'Подмена — Тест при выключенном экране';
    const safeBody =
      typeof body === 'string' && body.trim()
        ? body.slice(0, 200)
        : 'Если вы видите это на заблокированном экране и часах — всё настроено верно!';

    setTimeout(() => {
      sendWebPushNotification(subscription, {
        id: `test-delayed-${Date.now()}`,
        tag: 'podmena-test-delayed',
        title: safeTitle,
        body: safeBody,
        url: '/'
      }).catch((err) => {
        console.warn('[PushService] Delayed test push error:', err);
      });
    }, clampedDelay);

    res.json({ ok: true, scheduledInMs: clampedDelay });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Ошибка планирования теста' });
  }
});

// Web Push: cron trigger endpoint (for cron-job.org / external 1-min ping)
let lastExternalTriggerAt = 0;
const handlePushCheck = async (req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const now = Date.now();
  if (now - lastExternalTriggerAt < 5000) {
    return res.json({ ok: true, throttled: true, serverTime: now });
  }
  lastExternalTriggerAt = now;
  try {
    const result = await runPushDispatchCheck('cron');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Ошибка проверки расписания' });
  }
};
app.get('/api/push/check', handlePushCheck);
app.post('/api/push/check', handlePushCheck);

// AI Assistant endpoint
app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { prompt, vehicleContext } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Промпт не указан' });
    }

    const ai = getAIClient();
    
    let systemInstruction = `Вы — высококвалифицированный Диспетчер-Консультант УТТиСТ (Управление технологического транспорта и специальной техники).
Ваша задача — помогать подменным водителям, которые каждый день работают на разных автомобилях филиалов.

Ваши знания и приоритеты:
1. Терминология УТТиСТ (автоколонны, МВЗ — Место возникновения затрат, УЭВП, УАВР, ГП-1..ГП-14, ВП-1..ВП-4 вахтовые поселки, АГНКС, АЗС, ЕКЦ карты, Путевой лист ПЛ).
2. Правила заполнения путевых листов (МВЗ код, время выезда/возврата, отметки заказчика, спидометр, подписи).
3. Советы по безопасности движения в условиях Крайнего Севера (зимник, прогрев ПЖД/Webasto, подкачка колес, ТРЭКОЛ, рация).
4. Вежливый, четкий, шоферский и профессиональный тон. Дайте краткий, структурированный и практичный ответ.`;

    let userMessage = prompt;
    if (vehicleContext) {
      userMessage = `Контекст автомобиля:\n${JSON.stringify(vehicleContext, null, 2)}\n\nВопрос водителя: ${prompt}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.4,
      }
    });

    const answer = response.text || 'К сожалению, не удалось сгенерировать ответ. Попробуйте сформулировать вопрос иначе.';

    return res.json({ answer });
  } catch (err: any) {
    console.error('Error in AI Assistant API:', err);
    return res.status(500).json({
      error: 'Ошибка обращения к ИИ-помощнику',
      details: err.message || 'Неизвестная ошибка'
    });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UTTiST Driver App running on http://0.0.0.0:${PORT}`);
    startServerPushLoop();
  });
}

setupVite();

