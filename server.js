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

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildPosts({ industry, city }) {
  const niche = industry || 'local business';
  const place = city || 'your area';
  const industryLower = niche.toLowerCase();

  const isHospitality = /restaurant|cafe|coffee|bar|bistro|diner|bakery|food|grill|pizza|kitchen/.test(industryLower);
  const isTradeService = /plumb|hvac|electric|roofer|contractor|pest|clean|locksmith|landscap|handyman|repair/.test(industryLower);

  const templates = isHospitality
    ? [
        ['What’s new this week', `${niche} specials are now live in ${place}. Fresh menu updates and customer favorites are available now.`, 'View menu'],
        ['Table-ready in minutes', `Planning dinner in ${place}? ${niche} seating and pickup windows are open this week.`, 'Reserve now'],
        ['Weekend spotlight', `Serving ${place} this weekend with popular dishes and rotating chef selections.`, 'Book a table'],
        ['Customer favorite picks', `Not sure what to order at ${niche}? We just updated our most-loved picks for ${place} guests.`, 'See favorites'],
        ['Local and consistent', `${niche} is focused on quality, speed, and service for customers across ${place}.`, 'Order today'],
        ['Behind the scenes quality', `Fresh prep, clean kitchen flow, and reliable service — that’s how ${niche} runs in ${place}.`, 'Learn more'],
        ['Weeknight plans sorted', `If you’re in ${place}, make ${niche} your easy weeknight option for food and service you can trust.`, 'Get directions'],
        ['Group and family friendly', `${niche} can support group tables and family orders across ${place}.`, 'Message us'],
        ['New month, fresh offers', `Updated monthly offers are now available at ${niche} for ${place} customers.`, 'See offers'],
        ['Community favorite', `Proud to serve ${place} with consistent quality and hospitality every week.`, 'Visit us']
      ]
    : isTradeService
      ? [
          ['Need fast service today?', `Our ${niche} team is available across ${place} with same-day scheduling and clear pricing.`, 'Call now'],
          ['Local and trusted', `If you need reliable ${niche} support in ${place}, we’re ready to help with fast response times.`, 'Book service'],
          ['Weekend availability', `Serving ${place} this weekend for priority ${niche} requests.`, 'Request help'],
          ['Before/after quality', `Every ${niche} job in ${place} gets clear communication, photo proof, and clean completion.`, 'Get a quote'],
          ['Transparent pricing', `No surprise invoices. We provide upfront estimates for ${niche} work in ${place}.`, 'Message us'],
          ['Emergency support', `After-hours ${niche} help is available across ${place}. We respond quickly and keep you updated.`, 'Contact now'],
          ['Seasonal maintenance', `Prevent costly breakdowns in ${place} with scheduled ${niche} maintenance this month.`, 'Schedule visit'],
          ['Customer-first process', `From first call to finished job, our ${niche} process is built for speed and clarity in ${place}.`, 'Learn more'],
          ['New week, open slots', `Open appointments this week for ${niche} services in ${place}. Early booking gets priority windows.`, 'Reserve spot'],
          ['Community-focused service', `Proudly helping homes and businesses in ${place} with dependable ${niche} support.`, 'Call today']
        ]
      : [
          ['Serving local customers better', `${niche} is helping customers across ${place} with consistent service and clear communication.`, 'Learn more'],
          ['This week at a glance', `We’ve opened new slots this week for ${niche} requests in ${place}.`, 'Book now'],
          ['Customer-focused updates', `Our latest ${niche} updates are designed to make your experience in ${place} faster and easier.`, 'See details'],
          ['Trusted local support', `${niche} continues to support businesses and residents in ${place} with reliable delivery and service.`, 'Contact us'],
          ['Quality and consistency', `We focus on quality outcomes and responsive support for every ${niche} request in ${place}.`, 'Get started'],
          ['Monthly service highlights', `This month’s ${niche} priorities for ${place} customers are now available.`, 'View highlights'],
          ['Flexible scheduling', `${niche} appointment windows are open across ${place} this week.`, 'Schedule now'],
          ['Real local experience', `Local customers in ${place} choose ${niche} for practical, dependable service.`, 'See why'],
          ['Updated offers available', `New offers for ${niche} services in ${place} are now live.`, 'See offers'],
          ['Built for long-term trust', `${niche} is focused on long-term customer trust and service quality in ${place}.`, 'Message us']
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

const hasText = (value) => typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;

const parseTriState = (value) => {
  if (value === true || value === false) return value;
  const v = String(value || '').trim().toLowerCase();
  if (['yes', 'true', '1', 'present', 'complete'].includes(v)) return true;
  if (['no', 'false', '0', 'missing'].includes(v)) return false;
  return null;
};

async function enrichAuditInputWithGooglePlaces(input = {}) {
  const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || '').trim();
  const allowLookup = String(input.useLiveLookup ?? 'true').toLowerCase() !== 'false';

  if (!apiKey || !allowLookup || !hasText(input.businessName) || !hasText(input.city)) {
    return {
      mergedInput: input,
      liveDataUsed: false,
      liveDataSource: 'self-reported form input',
      liveDataError: null
    };
  }

  try {
    const textQuery = [
      sanitizeText(input.businessName || ''),
      sanitizeText(input.city || ''),
      sanitizeText(input.state || '')
    ].filter(Boolean).join(' ');

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.websiteUri,places.regularOpeningHours'
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
        languageCode: 'en'
      })
    });

    if (!response.ok) {
      throw new Error(`Google Places lookup failed (${response.status})`);
    }

    const payload = await response.json();
    const place = payload?.places?.[0];
    if (!place) {
      return {
        mergedInput: input,
        liveDataUsed: false,
        liveDataSource: 'self-reported form input',
        liveDataError: 'No place match found'
      };
    }

    const mergedInput = { ...input };

    if (!hasText(mergedInput.website) && hasText(place.websiteUri)) {
      mergedInput.website = place.websiteUri;
    }
    if (!hasText(mergedInput.rating) && Number.isFinite(place.rating)) {
      mergedInput.rating = place.rating;
    }
    if (!hasText(mergedInput.reviewCount) && Number.isFinite(place.userRatingCount)) {
      mergedInput.reviewCount = place.userRatingCount;
    }
    if (!hasText(mergedInput.hoursStatus) && place.regularOpeningHours) {
      mergedInput.hoursStatus = 'yes';
    }

    mergedInput.livePlaceName = sanitizeText(place?.displayName?.text || '');
    mergedInput.livePlaceAddress = sanitizeText(place?.formattedAddress || '');

    return {
      mergedInput,
      liveDataUsed: true,
      liveDataSource: 'Google Places + self-reported form input',
      liveDataError: null
    };
  } catch (error) {
    return {
      mergedInput: input,
      liveDataUsed: false,
      liveDataSource: 'self-reported form input',
      liveDataError: sanitizeText(error?.message || 'Live lookup unavailable')
    };
  }
}

function generateGbpAudit(input = {}, context = {}) {
  const businessName = sanitizeText(input.businessName || 'Business');
  const industry = sanitizeText(input.industry || 'local services');
  const city = sanitizeText(input.city || 'your city');
  const state = sanitizeText(input.state || '');
  const website = sanitizeText(input.website || '');
  const gbpUrl = sanitizeText(input.gbpUrl || '');

  const rating = hasText(input.rating) ? clamp(Number.parseFloat(String(input.rating)) || 0, 0, 5) : null;
  const reviewCount = hasText(input.reviewCount) ? Math.max(0, toInt(input.reviewCount, 0)) : null;
  const postsPerMonth = hasText(input.postsPerMonth) ? Math.max(0, toInt(input.postsPerMonth, 0)) : null;
  const photoCount = hasText(input.photoCount) ? Math.max(0, toInt(input.photoCount, 0)) : null;
  const servicesCount = hasText(input.servicesCount) ? Math.max(0, toInt(input.servicesCount, 0)) : null;
  const responseRate = hasText(input.responseRate) ? clamp(toInt(input.responseRate, 0), 0, 100) : null;
  const categoriesCount = hasText(input.categoriesCount) ? Math.max(0, toInt(input.categoriesCount, 0)) : null;

  const hoursStatus = parseTriState(input.hoursStatus ?? input.hoursComplete);
  const descriptionStatus = parseTriState(input.descriptionStatus ?? input.descriptionComplete);
  const bookingStatus = parseTriState(input.bookingStatus ?? input.hasBookingLink);
  const qnaStatus = parseTriState(input.qnaStatus ?? input.hasQna);

  let signalsUsed = 0;
  const totalSignals = 11;

  let profileScore = 12;
  let reputationScore = 12;
  let activityScore = 12;
  let conversionScore = 12;

  if (hasText(website)) {
    profileScore += 5;
    signalsUsed += 1;
  } else if (Object.prototype.hasOwnProperty.call(input, 'website')) {
    profileScore -= 3;
    signalsUsed += 1;
  }

  if (hasText(gbpUrl)) {
    profileScore += 4;
    signalsUsed += 1;
  }

  if (hoursStatus !== null) {
    profileScore += hoursStatus ? 3 : -3;
    signalsUsed += 1;
  }

  if (descriptionStatus !== null) {
    profileScore += descriptionStatus ? 3 : -2;
    signalsUsed += 1;
  }

  if (servicesCount !== null) {
    profileScore += servicesCount >= 20 ? 3 : servicesCount >= 10 ? 1 : servicesCount >= 5 ? -1 : -3;
    conversionScore += servicesCount >= 20 ? 3 : servicesCount >= 10 ? 2 : servicesCount >= 5 ? -1 : -3;
    signalsUsed += 1;
  }

  if (categoriesCount !== null) {
    profileScore += categoriesCount >= 4 ? 2 : categoriesCount >= 2 ? 1 : -1;
    conversionScore += categoriesCount >= 4 ? 2 : categoriesCount >= 2 ? 1 : -2;
    signalsUsed += 1;
  }

  if (rating !== null) {
    reputationScore += rating >= 4.6 ? 6 : rating >= 4.2 ? 4 : rating >= 3.8 ? 1 : rating >= 3.4 ? -3 : -6;
    signalsUsed += 1;
  }

  if (reviewCount !== null) {
    reputationScore += reviewCount >= 150 ? 5 : reviewCount >= 60 ? 3 : reviewCount >= 20 ? 0 : reviewCount >= 8 ? -3 : -6;
    signalsUsed += 1;
  }

  if (responseRate !== null) {
    reputationScore += responseRate >= 90 ? 4 : responseRate >= 70 ? 1 : responseRate >= 40 ? -2 : -5;
    conversionScore += responseRate >= 90 ? 2 : responseRate >= 70 ? 1 : responseRate >= 40 ? -1 : -2;
    signalsUsed += 1;
  }

  if (postsPerMonth !== null) {
    activityScore += postsPerMonth >= 8 ? 5 : postsPerMonth >= 4 ? 3 : postsPerMonth >= 2 ? 0 : postsPerMonth >= 1 ? -2 : -5;
    signalsUsed += 1;
  }

  if (photoCount !== null) {
    activityScore += photoCount >= 60 ? 5 : photoCount >= 25 ? 2 : photoCount >= 10 ? 0 : -3;
    signalsUsed += 1;
  }

  if (bookingStatus !== null) {
    conversionScore += bookingStatus ? 4 : -4;
  }

  if (qnaStatus !== null) {
    activityScore += qnaStatus ? 2 : -1;
  }

  profileScore = clamp(profileScore, 4, 25);
  reputationScore = clamp(reputationScore, 4, 25);
  activityScore = clamp(activityScore, 4, 25);
  conversionScore = clamp(conversionScore, 4, 25);

  const score = clamp(Math.round(profileScore + reputationScore + activityScore + conversionScore), 20, 96);
  const confidencePct = clamp(Math.round((signalsUsed / totalSignals) * 100), 18, 100);

  const confidenceLabel = confidencePct >= 75 ? 'High' : confidencePct >= 45 ? 'Medium' : 'Low';
  const modeLabel = context.liveDataUsed ? 'Estimate + live profile data' : 'Estimate';

  const grade =
    score >= 86 ? 'A' :
    score >= 74 ? 'B' :
    score >= 62 ? 'C' :
    score >= 50 ? 'D' : 'F';

  const priorities = [];
  if ((reviewCount ?? 0) < 40) {
    priorities.push({
      title: 'Grow review volume',
      why: 'Review depth directly impacts trust and click-through.',
      action: 'Implement structured review acquisition flow with post-service prompts.',
      impact: 'High'
    });
  }
  if ((responseRate ?? 0) < 75) {
    priorities.push({
      title: 'Increase review response coverage',
      why: 'Consistent responses improve perceived service quality.',
      action: 'Set weekly review response SLA and template bank.',
      impact: 'High'
    });
  }
  if ((postsPerMonth ?? 0) < 4) {
    priorities.push({
      title: 'Increase posting cadence',
      why: 'Low posting activity weakens profile freshness signals.',
      action: 'Publish 1–2 localized updates per week.',
      impact: 'High'
    });
  }
  if ((photoCount ?? 0) < 20) {
    priorities.push({
      title: 'Improve visual proof depth',
      why: 'Thin media libraries reduce confidence for first-time buyers.',
      action: 'Add weekly before/after or service evidence photos with captions.',
      impact: 'Medium'
    });
  }
  if (bookingStatus === false) {
    priorities.push({
      title: 'Fix direct conversion path',
      why: 'Missing booking/contact link reduces conversion efficiency.',
      action: 'Add a direct estimate/booking action in the profile.',
      impact: 'Medium'
    });
  }

  const projectedCallLift = clamp(Math.round((84 - score) * 0.6), 0, 35);
  const weeklyPlan = [
    'Week 1: Tighten profile foundations (core fields, categories, conversion path).',
    'Week 2: Standardize weekly posting + photo rhythm.',
    'Week 3: Raise review request and response coverage.',
    'Week 4: Review results and apply next-wave optimization.'
  ];

  const dataGaps = [];
  if (rating === null) dataGaps.push('Add current average rating');
  if (reviewCount === null) dataGaps.push('Add total review count');
  if (postsPerMonth === null) dataGaps.push('Add monthly posting frequency');
  if (photoCount === null) dataGaps.push('Add profile photo count');
  if (responseRate === null) dataGaps.push('Add review response rate %');
  if (servicesCount === null) dataGaps.push('Add number of listed services');
  if (categoriesCount === null) dataGaps.push('Add number of active categories');

  return {
    businessName,
    industry,
    location: [city, state].filter(Boolean).join(', ') || city || 'Local area',
    score,
    grade,
    projectedCallLift,
    modeLabel,
    confidenceLabel,
    confidencePct,
    dataSourceSummary: context.liveDataSource || 'self-reported form input',
    liveDataError: context.liveDataError || null,
    summary:
      `${businessName} is currently estimated at ${score}/100 (${grade}) with ${confidenceLabel.toLowerCase()} confidence (${confidencePct}%). Focus first on profile completeness, posting rhythm, and review operations.`,
    quickWins: [
      'Update top service entries with city-specific phrasing and intent match.',
      'Reply to unresolved reviews from the past 90 days.',
      'Publish one conversion-focused and one trust-focused GBP post this week.',
      'Refresh profile media with recent service photos and captions.',
      'Ensure direct booking/estimate path is visible in profile actions.'
    ],
    priorities: priorities.slice(0, 6),
    weeklyPlan,
    scoreBreakdown: [
      { name: 'Profile foundation', points: profileScore, maxPoints: 25, reason: 'Core profile quality, setup, and completeness.' },
      { name: 'Reputation signals', points: reputationScore, maxPoints: 25, reason: 'Rating strength, review depth, and response consistency.' },
      { name: 'Activity freshness', points: activityScore, maxPoints: 25, reason: 'Posting and photo cadence that signals active operations.' },
      { name: 'Conversion readiness', points: conversionScore, maxPoints: 25, reason: 'Direct action paths and service discoverability quality.' }
    ],
    dataGaps: dataGaps.slice(0, 6),
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
    const enrichment = await enrichAuditInputWithGooglePlaces(body);
    const audit = generateGbpAudit(enrichment.mergedInput, {
      liveDataUsed: enrichment.liveDataUsed,
      liveDataSource: enrichment.liveDataSource,
      liveDataError: enrichment.liveDataError
    });

    await appendJsonLine(GBP_AUDITS_FILE, {
      ts: new Date().toISOString(),
      businessName: audit.businessName,
      industry: audit.industry,
      location: audit.location,
      score: audit.score,
      grade: audit.grade,
      confidencePct: audit.confidencePct,
      modeLabel: audit.modeLabel,
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

app.post('/api/gbp/client/onboard', async (req, res) => {
  const body = req.body || {};
  const email = sanitizeText(body.email || '');
  const name = sanitizeText(body.name || '');

  if (!email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }

  const payload = {
    ts: new Date().toISOString(),
    source: 'gbp-client-onboard',
    email,
    name,
    businessName: sanitizeText(body.businessName || ''),
    phone: sanitizeText(body.phone || ''),
    website: sanitizeText(body.website || ''),
    industry: sanitizeText(body.industry || ''),
    city: sanitizeText(body.city || ''),
    state: sanitizeText(body.state || ''),
    plan: sanitizeText(body.plan || 'starter'),
    competitors: sanitizeText(body.competitors || ''),
    notes: sanitizeText(body.notes || '')
  };

  await appendJsonLine(GBP_LEADS_FILE, payload);
  return res.json({ ok: true, message: 'Onboarding saved.' });
});

app.post('/api/gbp/client/login', async (req, res) => {
  const body = req.body || {};
  const email = sanitizeText(body.email || '').toLowerCase();

  if (!email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }

  await appendJsonLine(GBP_LEADS_FILE, {
    ts: new Date().toISOString(),
    source: 'gbp-client-login',
    email
  });

  const audits = await readJsonLines(GBP_AUDITS_FILE);
  const relevantAudits = audits
    .filter((row) => String(row?.email || '').toLowerCase() === email)
    .sort((a, b) => String(b?.ts || '').localeCompare(String(a?.ts || '')));

  const latestAudit = relevantAudits[0] || null;

  const tasks = latestAudit
    ? [
        'Review latest audit score breakdown and close top-priority gap.',
        'Implement this week\'s posting and review-response cadence.',
        'Update services/categories and conversion links for your target city.',
        'Book strategy check-in for next optimization cycle.'
      ]
    : [
        'Run your first free audit to establish a baseline.',
        'Submit business details so we can map your scope.',
        'Book onboarding call to align priorities and package fit.',
        'Launch your first 30-day execution cycle.'
      ];

  return res.json({
    ok: true,
    dashboard: {
      auditRuns: relevantAudits.length,
      lastAuditScore: latestAudit?.score ?? null,
      lastAuditGrade: latestAudit?.grade ?? null,
      confidencePct: latestAudit?.confidencePct ?? null,
      lastUpdated: latestAudit?.ts ?? null,
      score: latestAudit?.score ?? null,
      tasks
    }
  });
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
