import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Example metric data
    const metrics = {
      users: 1200,
      activeUsers: 800,
      pageViews: 5000,
    };

    res.status(200).json(metrics);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}