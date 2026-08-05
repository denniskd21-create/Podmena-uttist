import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

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

// AI Assistant endpoint
app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { prompt, vehicleContext } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Промпт не указан' });
    }

    const ai = getAIClient();
    
    let systemInstruction = `Вы — высококвалифицированный Диспетчер-Консультант УТТиСТ (Управление технологического транспорта и специальной техники ООО «Газпром добыча Ямбург»).
Ваша задача — помогать подменным водителям, которые каждый день работают на разных автомобилях филиала (Ямбург, Новозаполярный, Новый Уренгой, промыслы ГП-1..14).

Ваши знания и приоритеты:
1. Терминология Газпром добыча Ямбург (УТТиСТ, АК-1..АК-5, МВЗ — Место возникновения затрат, УЭВП, УАВР, ГП-1..ГП-14, ВП-1..ВП-4 вахтовые поселки, АГНКС, АЗС, ЕКЦ карты, Путевой лист ПЛ).
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
  });
}

setupVite();
