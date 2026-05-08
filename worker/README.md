# Slippy Slidey leaderboard worker

A tiny Cloudflare Worker that backs the global leaderboard. One KV namespace
holds the top 50 scores; per-IP rate limiting prevents trivial spam.

## Deploy (~5–10 minutes)

1. Sign up at https://dash.cloudflare.com/sign-up if you don't have an account.
2. Install wrangler (the Cloudflare CLI):

   ```sh
   npm install -g wrangler
   wrangler login
   ```

3. From this `worker/` directory, create the KV namespace:

   ```sh
   wrangler kv namespace create LEADERBOARD
   wrangler kv namespace create LEADERBOARD --preview
   ```

   Each command prints an `id` (and a `preview_id`). Paste both into
   `wrangler.toml` where the placeholders are.

4. Deploy:

   ```sh
   wrangler deploy
   ```

   Wrangler prints a URL like `https://slippy-leaderboard.<your-subdomain>.workers.dev`.
   Copy that URL.

5. In `../game.js`, set:

   ```js
   const LEADERBOARD_URL = 'https://slippy-leaderboard.<your-subdomain>.workers.dev';
   ```

   Commit and push — the next Pages deploy will pick it up.

## Endpoints

- `GET /scores` — `{ scores: [{ name, score, t }, ...] }`, top 50 ordered by score desc.
- `POST /score` — body `{ name: string, score: number }`. Returns `{ ok, rank, scores }`
  on success or `{ error }` on validation failure / rate limit.

Names are normalized to letters, numbers, space, `_ . -` and capped at 16 chars.
Scores are clamped to `[0, 1_000_000]`. Each IP can submit once per 5 seconds.
