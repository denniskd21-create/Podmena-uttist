import {
  isValidPushSubscription,
  removePushSubscription,
  sendWebPushNotification
} from '../../server/pushService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { subscription, title, body, delayMs } = req.body || {};
    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Push-подписка не найдена или некорректна' });
    }
    // Keep within Vercel Hobby 10s serverless execution window
    const clampedDelay = Math.min(7500, Math.max(2000, Number(delayMs) || 7000));
    const safeTitle =
      typeof title === 'string' && title.trim()
        ? title.slice(0, 120)
        : 'Подмена — Тест при выключенном экране';
    const safeBody =
      typeof body === 'string' && body.trim()
        ? body.slice(0, 200)
        : 'Если вы видите это на заблокированном экране и часах — всё настроено верно!';

    await new Promise((resolve) => setTimeout(resolve, clampedDelay));

    const result = await sendWebPushNotification(subscription, {
      id: `test-delayed-${Date.now()}`,
      tag: 'podmena-test-delayed',
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
    return res.status(200).json({ ok: true, scheduledInMs: clampedDelay });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Ошибка планирования теста' });
  }
}
