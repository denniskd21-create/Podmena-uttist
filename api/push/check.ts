import { runPushDispatchCheck } from '../../server/pushService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await runPushDispatchCheck('cron');
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Ошибка проверки расписания' });
  }
}
