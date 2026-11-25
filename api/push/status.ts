import { getPushStatus, getSubscriptionId } from '../../server/pushService';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const endpoint = typeof req.query?.endpoint === 'string' ? req.query.endpoint : '';
    const subIdParam = typeof req.query?.subId === 'string' ? req.query.subId : '';
    const subId = endpoint ? getSubscriptionId(endpoint) : subIdParam;
    const status = await getPushStatus(subId);
    return res.status(200).json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Status error' });
  }
}
