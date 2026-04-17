import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';
import fs from 'fs/promises';

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
const DATA_DIR = path.join(__dirname, 'data');
const GBP_LEADS_FILE = path.join(DATA_DIR, 'gbp-leads.jsonl');
const GBP_AUDITS_FILE = path.join(DATA_DIR, 'gbp-audits.jsonl');

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

const toInt = (value, fallback = 0) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

async function appendJsonLine(filePath, payload) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // Best-effort logging only.
  }
}

function buildPosts({ industry, city }) {
  const niche = industry || 'local service';
  const place = city || 'your area';
  const templates = [
    ['Need fast service today?', `Our ${niche} team is available across ${place} with same-day scheduling and clear pricing.`, 'Call now'],
    ['Local and trusted', `If you need reliable ${niche} support in ${place}, we’re ready to help with fast response times.`, 'Book service'],
    ['Weekend availability', `Serving ${place} this weekend for urgent ${niche} requests. Licensed, insured, and straightforward.`, 'Request help'],
    ['Before/after quality', `Every ${niche} job in ${place} gets clear communication, photo proof, and clean completion.`, 'Get a quote'],
    ['Transparent pricing', `No surprise invoices. We provide upfront estimates for ${niche} work in ${place}.`, 'Message us'],
    ['Emergency support', `After-hours ${niche} help available across ${place}. We respond quickly and keep you updated.`, 'Contact now'],
    ['Seasonal maintenance', `Prevent costly breakdowns in ${place} with scheduled ${niche} maintenance this month.`, 'Schedule visit'],
    ['Customer-first process', `From first call to finished job, our ${niche} process is built for speed and clarity in ${place}.`, 'Learn more'],
    ['New week, open slots', `Open appointments this week for ${niche} services in ${place}. Early booking gets priority windows.`, 'Reserve spot'],
    ['Community-focused service', `Proudly helping homes and businesses in ${place} with dependable ${niche} support.`, 'Call today']
  ];

  return templates.map(([headline, body, cta]) => ({ headline, body, cta }));
}

function buildReviewReplies({ businessName }) {
  const name = businessName || 'our team';
  return {
    positive: [
      `Thank you so much for the 5-star review. We appreciate you choosing ${name} and are glad we could help.`,
      `We really appreciate your feedback. It means a lot to the ${name} team, and we’re always here if you need us again.`,
      `Thanks for sharing your experience. We’re happy the service delivered what you needed.`
    ],
    neutral: [
      `Thank you for the review. We appreciate your feedback and will use it to keep improving your experience.`,
      `We’re grateful for your honest feedback. If there is anything we can do better next time, please let us know.`,
      `Thanks for taking time to review us. We value your input and are committed to improving each visit.`
    ],
    negative: [
      `Thank you for sharing this. We’re sorry your experience didn’t meet expectations. Please contact us directly so we can make this right.`,
      `We appreciate the feedback and take this seriously. Our team wants to resolve this quickly—please message us with details.`,
      `Sorry for the frustration here. We’d like to review your case and fix the issue. Please reach out so we can help.`
    ]
  };
}

function generateGbpAudit(input = {}) {
  const businessName = sanitizeText(input.businessName || 'Business');
  const industry = sanitizeText(input.industry || 'trade services');
  const city = sanitizeText(input.city || 'your city');
  const state = sanitizeText(input.state || '');
  const website = sanitizeText(input.website || '');
  const gbpUrl = sanitizeText(input.gbpUrl || '');

  const rating = clamp(Number.parseFloat(String(input.rating || '0')) || 0, 0, 5);
  const reviewCount = Math.max(0, toInt(input.reviewCount, 0));
  const postsPerMonth = Math.max(0, toInt(input.postsPerMonth, 0));
  const photoCount = Math.max(0, toInt(input.photoCount, 0));
  const servicesCount = Math.max(0, toInt(input.servicesCount, 0));
  const responseRate = clamp(toInt(input.responseRate, 0), 0, 100);
  const categoriesCount = Math.max(0, toInt(input.categoriesCount, 1));

  const hoursComplete = Boolean(input.hoursComplete);
  const descriptionComplete = Boolean(input.descriptionComplete);
  const hasBookingLink = Boolean(input.hasBookingLink);
  const hasQna = Boolean(input.hasQna);

  const profileScore =
    (website ? 5 : 0) +
    (gbpUrl ? 3 : 0) +
    (hoursComplete ? 5 : 0) +
    (descriptionComplete ? 5 : 0) +
    Math.min(6, Math.floor(servicesCount / 2)) +
    Math.min(6, Math.floor(photoCount / 3));

  const reputationScore =
    Math.min(12, Math.round((rating / 5) * 12)) +
    Math.min(8, Math.floor(reviewCount / 15)) +
    Math.min(5, Math.floor(responseRate / 20));

  const activityScore =
    Math.min(10, postsPerMonth * 2) +
    Math.min(6, Math.floor(photoCount / 5)) +
    (hasQna ? 4 : 0);

  const localSeoScore =
    Math.min(8, categoriesCount * 2) +
    (hasBookingLink ? 5 : 0) +
    (city ? 4 : 0) +
    (state ? 2 : 0) +
    Math.min(6, Math.floor(servicesCount / 3));

  const score = clamp(profileScore + reputationScore + activityScore + localSeoScore, 8, 100);

  const grade =
    score >= 85 ? 'A' :
    score >= 72 ? 'B' :
    score >= 58 ? 'C' :
    score >= 45 ? 'D' : 'F';

  const priorities = [];
  if (reviewCount < 40) {
    priorities.push({
      title: 'Grow review volume',
      why: 'Low review count reduces trust and map click-through.',
      action: 'Launch post-job review ask workflow with QR + SMS templates.',
      impact: 'High'
    });
  }
  if (responseRate < 70) {
    priorities.push({
      title: 'Reply to more reviews',
      why: 'Response consistency is a visible trust signal on profile pages.',
      action: 'Use response templates to hit 90%+ reply coverage.',
      impact: 'High'
    });
  }
  if (postsPerMonth < 4) {
    priorities.push({
      title: 'Increase posting cadence',
      why: 'Inactive profiles lose freshness and engagement momentum.',
      action: 'Publish 2-3 localized posts per week.',
      impact: 'High'
    });
  }
  if (photoCount < 20) {
    priorities.push({
      title: 'Upload more job photos',
      why: 'Photo depth improves profile confidence for first-time customers.',
      action: 'Add before/after photos every week with service captions.',
      impact: 'Medium'
    });
  }
  if (servicesCount < 10) {
    priorities.push({
      title: 'Expand service coverage',
      why: 'Thin service lists miss long-tail local intent searches.',
      action: 'Add full service menu and city modifiers.',
      impact: 'Medium'
    });
  }
  if (!hasBookingLink) {
    priorities.push({
      title: 'Add booking/contact link',
      why: 'Missing direct action links lowers conversion from profile views.',
      action: 'Connect website booking page or estimate form.',
      impact: 'Medium'
    });
  }

  const projectedCallLift = clamp(Math.round((100 - score) * 0.7), 8, 45);
  const weeklyPlan = [
    'Week 1: GBP cleanup (categories, services, description, booking link).',
    'Week 2: Publish localized post pack + upload new job photos.',
    'Week 3: Review request push and response cleanup to 90%+.',
    'Week 4: Competitor gap review + repeat top performing post format.'
  ];

  return {
    businessName,
    industry,
    location: [city, state].filter(Boolean).join(', ') || city || 'Local area',
    score,
    grade,
    projectedCallLift,
    summary:
      `${businessName} is currently at ${score}/100 (${grade}). The fastest path to more inbound calls is fixing profile completeness and consistent posting/review operations.`,
    quickWins: [
      'Update top 8 service entries with city-specific phrasing.',
      'Reply to every unanswered review from the last 90 days.',
      'Post one emergency-focused and one maintenance-focused update this week.',
      'Add 10 recent before/after photos with clear captions.',
      'Pin a direct estimate/booking link in the profile contact section.'
    ],
    priorities: priorities.slice(0, 6),
    weeklyPlan,
    generatedPosts: buildPosts({ industry, city }),
    reviewReplies: buildReviewReplies({ businessName })
  };
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/gbp/audit', async (req, res) => {
  try {
    const body = req.body || {};
    const audit = generateGbpAudit(body);

    await appendJsonLine(GBP_AUDITS_FILE, {
      ts: new Date().toISOString(),
      businessName: audit.businessName,
      industry: audit.industry,
      location: audit.location,
      score: audit.score,
      email: sanitizeText(body.email || ''),
      source: 'gbp-free-audit'
    });

    return res.json({ ok: true, audit });
  } catch {
    return res.status(500).json({ ok: false, error: 'Could not run audit right now.' });
  }
});

app.post('/api/gbp/lead', async (req, res) => {
  const body = req.body || {};
  const email = sanitizeText(body.email || '');
  const name = sanitizeText(body.name || '');

  if (!email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }

  await appendJsonLine(GBP_LEADS_FILE, {
    ts: new Date().toISOString(),
    email,
    name,
    businessName: sanitizeText(body.businessName || ''),
    website: sanitizeText(body.website || ''),
    phone: sanitizeText(body.phone || ''),
    notes: sanitizeText(body.notes || ''),
    source: sanitizeText(body.source || 'gbp-site')
  });

  return res.json({ ok: true, message: 'Thanks — we got your details.' });
});

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
