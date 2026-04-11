import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

const app = express();
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 ClickWorldNews/0.4',
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'
  },
  timeout: 12000
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8093);
const CACHE_TTL_MS = 1000 * 60 * 30;
const cache = new Map();
const reverseGeoCache = new Map();

const WORLD_FALLBACK_FEEDS = [
  'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
];

const safeCode = (value) => {
  const v = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : 'US';
};

const sanitizeText = (value) =>
  String(value || '')
    .replace(/[<>]/g, '')
    .trim();

const sourceFromItem = (item) => {
  if (item?.source?.title) return sanitizeText(item.source.title);
  try {
    const host = new URL(item.link).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return 'Source';
  }
};

const toNum = (value) => Number.parseFloat(String(value || ''));

const validLatLng = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

async function parseFeed(url, limit = 10) {
  const now = Date.now();
  const cached = cache.get(url);

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const feed = await parser.parseURL(url);

  const data = (feed.items || [])
    .filter((item) => item?.title && item?.link)
    .slice(0, limit)
    .map((item, idx) => ({
      rank: idx + 1,
      title: sanitizeText(item.title),
      link: item.link,
      published: item.isoDate || item.pubDate || null,
      source: sourceFromItem(item)
    }));

  cache.set(url, { ts: now, data });
  return data;
}

function dedupeStories(stories = [], limit = 10) {
  const seen = new Set();
  const out = [];

  for (const story of stories) {
    const key = `${String(story?.title || '').toLowerCase()}|${String(story?.link || '').toLowerCase()}`;
    if (!story?.title || !story?.link || seen.has(key)) continue;
    seen.add(key);
    out.push(story);
    if (out.length >= limit) break;
  }

  return out.map((story, idx) => ({ ...story, rank: idx + 1 }));
}

async function parseFirstAvailable(urls = [], limit = 10) {
  const merged = [];

  for (const url of urls) {
    if (!url || merged.length >= limit) continue;
    try {
      const stories = await parseFeed(url, limit);
      merged.push(...stories);
    } catch {
      // Try next candidate.
    }
  }

  const deduped = dedupeStories(merged, limit);
  if (deduped.length) return deduped;

  const cachedFallback = [...cache.values()]
    .map((entry) => entry?.data)
    .find((data) => Array.isArray(data) && data.length);

  if (cachedFallback?.length) {
    return dedupeStories(cachedFallback, limit);
  }

  return [];
}

async function parseTieredQueryPlan(queryPlan = [], worldFallback = [], limit = 12) {
  for (const step of queryPlan) {
    const query = sanitizeText(step?.query || '');
    const gl = safeCode(step?.gl || 'US');
    if (!query) continue;

    const stories = await parseFirstAvailable([
      googleSearchUrl(query, gl),
      googleSearchUrl(query, 'US')
    ], limit);

    if (stories.length >= 3) {
      return {
        stories,
        tierUsed: step.tier || 'local',
        queryUsed: query,
        glUsed: gl
      };
    }
  }

  const fallbackStories = await parseFirstAvailable(worldFallback, limit);
  return {
    stories: fallbackStories,
    tierUsed: 'global-fallback',
    queryUsed: '',
    glUsed: 'US'
  };
}

const googleHeadlinesUrl = (code = 'US') => {
  const c = safeCode(code);
  return `https://news.google.com/rss/headlines?hl=en-US&gl=${c}&ceid=${c}:en`;
};

const googleSearchUrl = (query = '', code = 'US') => {
  const c = safeCode(code);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=${c}&ceid=${c}:en`;
};

async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = reverseGeoCache.get(key);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS * 6) {
    return cached.data;
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1&namedetails=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ClickWorldNews/0.3 (Geo News Prototype)',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Reverse geocode unavailable');
  }

  const json = await response.json();
  const a = json?.address || {};

  const country = sanitizeText(a.country || '');
  const state = sanitizeText(a.state || a.region || a.province || '');
  const city = sanitizeText(a.city || a.town || a.village || a.county || '');
  const countryCode = safeCode(a.country_code || 'US');

  const label = [city, state, country].filter(Boolean).join(', ') ||
    sanitizeText((json.display_name || '').split(',').slice(0, 3).join(',')) ||
    `Near ${lat.toFixed(2)}, ${lng.toFixed(2)}`;

  const data = { label, country, state, city, countryCode };
  reverseGeoCache.set(key, { ts: Date.now(), data });

  return data;
}

async function lookupPlaces(query) {
  const q = sanitizeText(query);
  if (!q) return [];

  const key = `lookup:${q.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS * 3) {
    return cached.data;
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ClickWorldNews/0.3 (Geo News Prototype)',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Lookup unavailable');
  }

  const json = await response.json();

  const places = (json || [])
    .map((item) => {
      const lat = toNum(item.lat);
      const lng = toNum(item.lon);
      if (!validLatLng(lat, lng)) return null;

      const a = item.address || {};
      const country = sanitizeText(a.country || '');
      const state = sanitizeText(a.state || a.region || a.province || '');
      const city = sanitizeText(a.city || a.town || a.village || a.county || sanitizeText(item.name || ''));
      const label = sanitizeText(item.display_name || [city, state, country].filter(Boolean).join(', '));

      return {
        label,
        lat,
        lng,
        city,
        state,
        country,
        countryCode: safeCode(a.country_code || 'US')
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  cache.set(key, { ts: Date.now(), data: places });

  return places;
}

app.use((req, res, next) => {
  if (req.path === '/' || /\.(?:html|js|css)$/i.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/news', async (req, res) => {
  const code = safeCode(req.query.country);
  const countryName = sanitizeText(req.query.name || code);

  try {
    const stories = await parseFirstAvailable([
      googleHeadlinesUrl(code),
      googleSearchUrl(`${countryName} breaking news`, code),
      googleSearchUrl(`${countryName} news`, 'US'),
      ...WORLD_FALLBACK_FEEDS
    ], 10);

    res.json({
      ok: true,
      location: countryName,
      code,
      stories
    });
  } catch {
    res.status(500).json({
      ok: false,
      error: 'Could not load country feed right now.'
    });
  }
});

app.get('/api/nearby-news', async (req, res) => {
  const lat = toNum(req.query.lat);
  const lng = toNum(req.query.lng);
  const labelHint = sanitizeText(req.query.label || '');
  const queryHint = sanitizeText(req.query.q || '');

  if (!validLatLng(lat, lng)) {
    return res.status(400).json({ ok: false, error: 'Invalid coordinates.' });
  }

  try {
    let geo;
    try {
      geo = await reverseGeocode(lat, lng);
    } catch {
      geo = {
        label: labelHint || `Near ${lat.toFixed(2)}, ${lng.toFixed(2)}`,
        country: '',
        state: '',
        city: '',
        countryCode: 'US'
      };
    }

    const cityStateCountry = [geo.city, geo.state, geo.country].filter(Boolean).join(' ');
    const regionalHint = [geo.state, geo.country].filter(Boolean).join(' ');
    const primaryQuery = queryHint || cityStateCountry || labelHint || `${lat.toFixed(2)} ${lng.toFixed(2)}`;

    const countryCode = safeCode(geo.countryCode || 'US');
    const queryPlan = [
      { tier: 'local', query: `${primaryQuery} breaking news`, gl: countryCode },
      { tier: 'local', query: `${primaryQuery} latest headlines`, gl: countryCode },
      regionalHint ? { tier: 'admin1', query: `${regionalHint} regional news`, gl: countryCode } : null,
      geo.country ? { tier: 'country', query: `${geo.country} breaking news`, gl: countryCode } : null,
      geo.country ? { tier: 'country-backup', query: `${geo.country} breaking news`, gl: 'US' } : null
    ].filter(Boolean);

    const planResult = await parseTieredQueryPlan(queryPlan, WORLD_FALLBACK_FEEDS, 12);

    res.json({
      ok: true,
      location: labelHint || geo.label,
      code: countryCode,
      geo: { lat, lng, ...geo },
      queryPlan,
      tierUsed: planResult.tierUsed,
      queryUsed: planResult.queryUsed,
      glUsed: planResult.glUsed,
      stories: planResult.stories
    });
  } catch {
    res.status(500).json({ ok: false, error: 'Could not load nearby location news.' });
  }
});

app.get('/api/lookup', async (req, res) => {
  const q = sanitizeText(req.query.q || '');

  if (!q || q.length < 2) {
    return res.status(400).json({ ok: false, error: 'Query must be at least 2 characters.' });
  }

  try {
    const places = await lookupPlaces(q);
    res.json({ ok: true, places });
  } catch {
    res.status(500).json({ ok: false, error: 'Could not lookup places right now.' });
  }
});

app.get('/api/state-news', async (req, res) => {
  const state = sanitizeText(req.query.state || 'California');

  try {
    const stories = await parseFirstAvailable([
      googleSearchUrl(`${state} state news`, 'US'),
      googleSearchUrl(`${state} breaking news`, 'US'),
      ...WORLD_FALLBACK_FEEDS
    ], 10);

    res.json({
      ok: true,
      location: `${state}, USA`,
      stories
    });
  } catch {
    res.status(500).json({
      ok: false,
      error: 'Could not load state news right now.'
    });
  }
});

app.get('/api/ultra-signal', async (_req, res) => {
  const sections = [
    { name: 'Top World', query: 'global breaking news', gl: 'US' },
    { name: 'US & Americas', query: 'United States politics economy', gl: 'US' },
    { name: 'Europe', query: 'Europe news', gl: 'GB' },
    { name: 'Middle East', query: 'Middle East news', gl: 'AE' },
    { name: 'Asia', query: 'Asia breaking news', gl: 'SG' },
    { name: 'Markets & Tech', query: 'markets technology news', gl: 'US' }
  ];

  try {
    const results = await Promise.all(
      sections.map(async (section) => {
        const code = safeCode(section.gl || 'US');
        const stories = await parseFirstAvailable([
          googleSearchUrl(section.query, code),
          googleSearchUrl(section.query, 'US'),
          ...WORLD_FALLBACK_FEEDS
        ], 12);
        return {
          name: section.name,
          stories
        };
      })
    );

    res.json({ ok: true, sections: results });
  } catch {
    res.status(500).json({ ok: false, error: 'Could not load ultra signal feed right now.' });
  }
});

app.get('/api/signal', async (_req, res) => {
  try {
    const stories = await parseFirstAvailable([
      'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=world%20breaking%20news&hl=en-US&gl=US&ceid=US:en',
      ...WORLD_FALLBACK_FEEDS
    ], 30);

    res.json({ ok: true, stories });
  } catch {
    res.status(500).json({ ok: false, error: 'Could not load signal feed right now.' });
  }
});

app.listen(PORT, () => {
  console.log(`WorldPulse MVP running on http://localhost:${PORT}`);
});
