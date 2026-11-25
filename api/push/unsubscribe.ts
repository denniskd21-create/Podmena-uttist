import { removePushSubscription } from '../../server/pushService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return res.status(400).json({ error: 'Некорректный endpoint' });
    }
    const result = await removePushSubscription(endpoint);
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Ошибка отписки' });
  }
}
