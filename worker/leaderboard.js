// Cloudflare Worker for the Slippy Slidey global leaderboard.
//
// Endpoints:
//   GET  /scores       -> { scores: [{ name, score, t }, ...] } (top 50)
//   POST /score        -> { name, score } (creates entry, returns updated list)
//
// Storage: a single KV key ("top") holds a JSON array of the top scores.
// Per-IP rate-limit keys ("rl:<ip>") expire after 60s.

const TOP_KEY = 'top';
const TOP_LIMIT = 50;
const NAME_MAX = 16;
const SCORE_MAX = 1_000_000;
const RATE_LIMIT_MS = 5_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    try {
      if (req.method === 'GET' && url.pathname === '/scores') {
        const top = (await env.LEADERBOARD.get(TOP_KEY, { type: 'json' })) || [];
        return json({ scores: top });
      }

      if (req.method === 'POST' && url.pathname === '/score') {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: 'invalid body' }, 400);

        const name = String(body.name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, NAME_MAX);
        const score = Math.floor(Number(body.score));
        if (!name) return json({ error: 'invalid name' }, 400);
        if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
          return json({ error: 'invalid score' }, 400);
        }

        const ip = req.headers.get('cf-connecting-ip') || 'anon';
        const rkey = `rl:${ip}`;
        const last = await env.LEADERBOARD.get(rkey);
        if (last && Date.now() - parseInt(last, 10) < RATE_LIMIT_MS) {
          return json({ error: 'rate limited' }, 429);
        }
        await env.LEADERBOARD.put(rkey, String(Date.now()), { expirationTtl: 60 });

        let top = (await env.LEADERBOARD.get(TOP_KEY, { type: 'json' })) || [];
        const entry = { name, score, t: Date.now() };
        top.push(entry);
        top.sort((a, b) => b.score - a.score || a.t - b.t);
        top = top.slice(0, TOP_LIMIT);
        await env.LEADERBOARD.put(TOP_KEY, JSON.stringify(top));

        const rank = top.findIndex(s => s === entry || (s.name === entry.name && s.score === entry.score && s.t === entry.t));
        return json({ ok: true, rank: rank + 1, scores: top });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server error' }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
