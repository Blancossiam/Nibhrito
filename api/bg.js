/**
 * api/bg.js — Background image proxy (Vercel Serverless Function)
 *
 * Accepts: GET /api/bg?q=<search+query>
 * Returns: { url: string | null }
 *
 * The PEXELS_API_KEY environment variable is set in the Vercel dashboard
 * and is NEVER exposed to the client.
 *
 * Pexels API docs: https://www.pexels.com/api/documentation/
 */

const PEXELS_BASE    = 'https://api.pexels.com/v1/search';
const MAX_QUERY_LEN  = 120;
const QUERY_REGEX    = /^[\w\s,'-]{1,120}$/;

module.exports = async function handler(req, res) {
  // ── CORS: only allow same origin (Vercel enforces this for same-site
  //          functions, but be explicit) ───────────────────────────────
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://nibhrito.vercel.app',
    'http://localhost',
    'http://127.0.0.1',
  ];
  const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || origin === '';
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── API key check ─────────────────────────────────────────────────
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('[bg] PEXELS_API_KEY is not set');
    return res.status(200).json({ url: null });
  }

  // ── Query validation ──────────────────────────────────────────────
  const rawQ = (req.query.q || '').trim();
  if (!rawQ || rawQ.length > MAX_QUERY_LEN || !QUERY_REGEX.test(rawQ)) {
    return res.status(200).json({ url: null });
  }

  // Sanitise: strip anything outside safe characters (belt-and-suspenders)
  const safeQ = rawQ.replace(/[^\w\s,'-]/g, ' ').trim();
  if (!safeQ) return res.status(200).json({ url: null });

  // ── Pexels fetch ──────────────────────────────────────────────────
  try {
    const pexelsUrl = new URL(PEXELS_BASE);
    pexelsUrl.searchParams.set('query', safeQ);
    pexelsUrl.searchParams.set('per_page', '5');
    pexelsUrl.searchParams.set('orientation', 'landscape');

    const pexelsRes = await fetch(pexelsUrl.toString(), {
      headers: {
        Authorization: apiKey,
      },
      // Timeout guard (Vercel functions default 10 s on Hobby)
      signal: AbortSignal.timeout(6000),
    });

    if (!pexelsRes.ok) {
      console.warn(`[bg] Pexels API error: ${pexelsRes.status}`);
      return res.status(200).json({ url: null });
    }

    const data = await pexelsRes.json();
    const photos = data.photos || [];

    if (photos.length === 0) {
      return res.status(200).json({ url: null });
    }

    // Pick a random result among the first 5 for variety
    const photo = photos[Math.floor(Math.random() * photos.length)];

    // Use the 'large2x' src for high-resolution fullscreen coverage
    const imageUrl = photo?.src?.large2x || photo?.src?.large || null;

    // Cache hint: client can cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

    return res.status(200).json({ url: imageUrl });
  } catch (err) {
    console.warn('[bg] Fetch failed:', err.message);
    return res.status(200).json({ url: null });
  }
}
