import { isValidPushSubscription, upsertPushSubscription } from '../../server/pushService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
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
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Error in /api/push/subscribe:', err);
    return res.status(500).json({ error: err?.message || 'Ошибка сохранения подписки' });
  }
}
