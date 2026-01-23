import type { VercelRequest, VercelResponse } from "@vercel/node";

const URL_ = process.env.UPSTASH_REDIS_REST_URL!;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;

async function redis(path: string, init?: RequestInit) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // /api/metrics?action=stl_download
    const action = String(req.query.action || "");

    if (req.method === "POST") {
      if (!action) return res.status(400).json({ error: "Missing action" });

      const key = `rf:${action}`;
      await redis(`/incr/${encodeURIComponent(key)}`, { method: "POST" });
      const r = await redis(`/get/${encodeURIComponent(key)}`, { method: "GET" });

      return res.status(200).json({ ok: true, action, value: Number(r?.result ?? 0) });
    }

    if (req.method === "GET") {
      if (!action) return res.status(400).json({ error: "Missing action" });

      const key = `rf:${action}`;
      const r = await redis(`/get/${encodeURIComponent(key)}`, { method: "GET" });

      return res.status(200).json({ ok: true, action, value: Number(r?.result ?? 0) });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
