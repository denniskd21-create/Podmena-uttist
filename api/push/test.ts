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
    const { subscription, title, body } = req.body || {};
    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Push-подписка не найдена или некорректна' });
    }
    const safeTitle =
      typeof title === 'string' && title.trim() ? title.slice(0, 120) : 'Подмена — Проверка Push';
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
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Ошибка отправки теста' });
  }
}
