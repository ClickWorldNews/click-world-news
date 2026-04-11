const globeMount = document.getElementById('globeViz');
const pingCenterBtn = document.getElementById('ping-center');
const labelsToggleBtn = document.getElementById('labels-toggle');
const openSignalBtn = document.getElementById('open-signal');
const locationBadge = document.getElementById('location-badge');
const regionChip = document.getElementById('region-chip');
const statusBanner = document.getElementById('status-banner');

const feedSheet = document.getElementById('feed-sheet');
const feedTitle = document.getElementById('feed-title');
const feedList = document.getElementById('feed-list');
const feedLoading = document.getElementById('feed-loading');
const closeFeedBtn = document.getElementById('close-feed');
const refreshFeedBtn = document.getElementById('refresh-feed');
const sharePingBtn = document.getElementById('share-ping');

const openSearchBtn = document.getElementById('open-search');
const closeSearchBtn = document.getElementById('close-search');
const searchModal = document.getElementById('search-modal');
const searchInput = document.getElementById('search-input');
const searchSubmitBtn = document.getElementById('search-submit');
const searchResults = document.getElementById('search-results');
const savedList = document.getElementById('saved-list');
const clearSavedBtn = document.getElementById('clear-saved');
const sheetHandle = document.querySelector('.sheet-handle');

const isMobile =
  window.matchMedia('(hover: none), (pointer: coarse)').matches ||
  window.innerWidth < 900;

const STORAGE_KEY = 'click-world-saved-pings-v1';
const FEED_CACHE_KEY = 'click-world-last-feed-v1';
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo');
const MAJOR_LABEL_ISO = new Set([
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE',
  'GB', 'FR', 'DE', 'ES', 'IT', 'PL', 'UA', 'SE', 'NO', 'TR',
  'RU', 'SA', 'AE', 'EG', 'NG', 'ZA', 'KE',
  'IN', 'CN', 'JP', 'KR', 'ID', 'TH', 'VN', 'PH', 'PK', 'BD',
  'AU', 'NZ'
]);

const NAME_OVERRIDES = {
  US: 'United States',
  GB: 'United Kingdom',
  AE: 'UAE'
};

const state = {
  globeCenter: { lat: 20, lng: 0 },
  selectedLocation: {
    type: 'world',
    code: '',
    name: 'World View',
    latlng: { lat: 20, lng: 0 }
  },
  feed: [],
  isLoadingFeed: false,
  labelsVisible: true,
  savedPings: [],
  mode: 'globe',
  feedScope: 'global',
  lastFetchTimestamp: 0,
  lastLabelRefresh: 0
};

let polygons = [];
let countryCenters = [];
let countryCenterByIso = new Map();
let labelPoints = [];
let activeRequest = 0;
let centerTimer = null;
let autoRotateTimer = null;
let lastFeedLoader = null;
let activeFetchController = null;

if (typeof window.Globe !== 'function') {
  showStatus('Globe engine failed to load. Refresh once or switch network.');
  throw new Error('Globe library unavailable');
}

const globe = Globe({
  animateIn: false,
  rendererConfig: {
    antialias: !isMobile,
    alpha: true
  }
})(globeMount)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('/vendor/earth-night.jpg')
  .bumpImageUrl('/vendor/earth-topology.png')
  .showAtmosphere(false)
  .atmosphereColor('#0d121a')
  .atmosphereAltitude(0)
  .polygonAltitude((f) => (f?.properties?.ISO_A2 === state.selectedLocation.code ? 0.072 : 0.002))
  .polygonCapColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(164, 181, 196, 0.28)'
      : 'rgba(0, 0, 0, 0)'
  )
  .polygonSideColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(94, 109, 126, 0.14)'
      : 'rgba(0, 0, 0, 0)'
  )
  .polygonStrokeColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(171, 191, 214, 0.44)'
      : 'rgba(0, 0, 0, 0)'
  )
  .polygonsTransitionDuration(0)
  .labelsData([])
  .labelLat((d) => d.lat)
  .labelLng((d) => d.lng)
  .labelText((d) => d.label)
  .labelSize((d) => {
    const altitude = Number(globe.pointOfView()?.altitude) || 2;
    const base = d?.labelScale ?? (isMobile ? 0.76 : 0.88);
    return Math.max(0.52, base - Math.max(0, altitude - 1.2) * 0.18);
  })
  .labelDotRadius(() => (isMobile ? 0.09 : 0.12))
  .labelAltitude(() => 0.048)
  .labelColor(() => 'rgba(238, 247, 255, 0.96)')
  .labelResolution(3)
  .pointsData([])
  .pointLat((d) => d.lat)
  .pointLng((d) => d.lng)
  .pointAltitude((d) => d.altitude ?? 0.035)
  .pointRadius((d) => d.radius ?? 0.45)
  .pointColor((d) => d.color)
  .pointResolution(isMobile ? 10 : 18)
  .ringsData([])
  .ringLat((d) => d.lat)
  .ringLng((d) => d.lng)
  .ringColor((d) => (t) => (t < 1 ? d.color : 'transparent'))
  .ringMaxRadius((d) => d.maxRadius ?? 3.2)
  .ringPropagationSpeed((d) => d.speed ?? 0.9)
  .ringRepeatPeriod((d) => d.repeatPeriod ?? 1400)
  .onPolygonClick((feat) => {
    const iso = feat?.properties?.ISO_A2;
    const name = feat?.properties?.ADMIN || feat?.properties?.NAME || iso;
    if (!iso || iso === '-99') return;

    const center = countryCenterByIso.get(iso) || getFeatureCenter(feat);
    if (!center) return;

    selectCountry(iso, name, center.lat, center.lng);
  })
  .onGlobeClick((coords) => {
    if (!coords) return;
    pingAt(coords.lat, coords.lng, '', '');
  });

// Keep labels fully in WebGL (more stable on mobile than heavy HTML overlays).
const htmlLabelsSupported = false;

const controls = globe.controls();
globe.pointOfView({ lat: 20, lng: 0, altitude: 2.05 }, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = isMobile ? 0.16 : 0.22;
controls.enablePan = false;
controls.minDistance = 125;
controls.maxDistance = 300;

if (typeof globe.polygonCapCurvatureResolution === 'function') {
  globe.polygonCapCurvatureResolution(isMobile ? 2 : 4);
}

function enforceGlobeVisualTheme() {
  if (typeof globe.showAtmosphere === 'function') {
    globe.showAtmosphere(false).atmosphereColor('#0d121a').atmosphereAltitude(0);
  }

  if (typeof globe.globeMaterial === 'function' && window.THREE) {
    const material = globe.globeMaterial();
    if (material) {
      material.color = new THREE.Color('#c7d0dc');
      material.emissive = new THREE.Color('#000000');
      material.emissiveIntensity = 0.02;
      material.shininess = 1.8;
      material.specular = new THREE.Color('#070c15');
      material.needsUpdate = true;
    }
  }

  if (typeof globe.scene === 'function' && window.THREE) {
    const scene = globe.scene();
    if (scene?.traverse) {
      scene.traverse((obj) => {
        if (obj?.isAmbientLight) {
          obj.intensity = 0.5;
          obj.color = new THREE.Color('#d5dbe3');
        }
        if (obj?.isDirectionalLight) {
          obj.intensity = 0.62;
          obj.color = new THREE.Color('#ffffff');
        }
      });
    }
  }
}

enforceGlobeVisualTheme();
setTimeout(enforceGlobeVisualTheme, 500);
setTimeout(enforceGlobeVisualTheme, 1500);

controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(autoRotateTimer);
});

controls.addEventListener('end', () => {
  clearTimeout(autoRotateTimer);
  autoRotateTimer = setTimeout(() => {
    controls.autoRotate = true;
  }, 2600);
});

function showStatus(text) {
  statusBanner.textContent = text;
  statusBanner.classList.remove('hidden');
}

function hideStatus() {
  statusBanner.classList.add('hidden');
}

function setLoading(flag) {
  state.isLoadingFeed = flag;
  feedLoading.classList.toggle('hidden', !flag);
}

function toDate(value) {
  if (!value) return 'just now';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'just now';
  return d.toLocaleString();
}

function normalizeFeature(feature) {
  const p = feature?.properties || {};
  const iso = String(p.ISO_A2 || p['ISO3166-1-Alpha-2'] || p.iso_a2 || p.iso2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso) || iso === '-99') return null;

  const name = String(p.ADMIN || p.NAME || p.name || p.NAME_EN || iso).trim();

  return {
    ...feature,
    properties: {
      ...p,
      ISO_A2: iso,
      ADMIN: name,
      NAME: name
    }
  };
}

function getFeatureCenter(feature) {
  const coords = [];

  const walk = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      coords.push([node[0], node[1]]);
      return;
    }
    node.forEach(walk);
  };

  walk(feature?.geometry?.coordinates);
  if (!coords.length) return null;

  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  const sinLng = coords.reduce((sum, c) => sum + Math.sin((c[0] * Math.PI) / 180), 0);
  const cosLng = coords.reduce((sum, c) => sum + Math.cos((c[0] * Math.PI) / 180), 0);
  const lng = (Math.atan2(sinLng / coords.length, cosLng / coords.length) * 180) / Math.PI;

  return { lat, lng };
}

function buildCountryCenters() {
  countryCenterByIso = new Map();
  countryCenters = polygons
    .map((f) => {
      const center = getFeatureCenter(f);
      if (!center) return null;
      const iso = f?.properties?.ISO_A2;
      const name = f?.properties?.ADMIN || f?.properties?.NAME || iso;
      return {
        iso,
        name,
        label: NAME_OVERRIDES[iso] || name,
        lat: center.lat,
        lng: center.lng
      };
    })
    .filter(Boolean);

  for (const c of countryCenters) {
    countryCenterByIso.set(c.iso, { lat: c.lat, lng: c.lng });
  }
}

function findNearestCountry(lat, lng) {
  let best = null;
  let bestScore = Infinity;

  for (const item of countryCenters) {
    const latDelta = Math.abs(item.lat - lat);
    const lngDelta = Math.abs((((item.lng - lng) + 540) % 360) - 180);
    const score = latDelta * latDelta + lngDelta * lngDelta;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

function findFeatureByIso(iso) {
  return polygons.find((f) => f?.properties?.ISO_A2 === iso) || null;
}

function angularDistance(latA, lngA, latB, lngB) {
  const toRad = (v) => (v * Math.PI) / 180;
  const aLat = toRad(latA);
  const bLat = toRad(latB);
  const dLat = bLat - aLat;
  const dLng = toRad(lngB - lngA);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildLabelPoints(anchor = state.globeCenter) {
  const nearest = findNearestCountry(anchor.lat, anchor.lng);
  const major = countryCenters
    .filter((c) => MAJOR_LABEL_ISO.has(c.iso))
    .map((c) => ({ ...c, priority: 3 }));

  const centerSlice = countryCenters
    .map((c) => ({
      ...c,
      dist: angularDistance(anchor.lat, anchor.lng, c.lat, c.lng),
      priority: 2
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, isMobile ? 16 : 28)
    .map(({ dist, ...rest }) => rest);

  const candidates = [...major, ...centerSlice];

  if (state.selectedLocation.code) {
    const selected = countryCenters.find((c) => c.iso === state.selectedLocation.code);
    if (selected) candidates.push({ ...selected, priority: 5 });
  }

  if (nearest) candidates.push({ ...nearest, priority: 4 });

  if (state.selectedLocation?.latlng && state.selectedLocation?.name && state.selectedLocation.type !== 'world') {
    candidates.push({
      iso: `PIN:${state.selectedLocation.code || 'XX'}`,
      label: state.selectedLocation.name,
      lat: Number(state.selectedLocation.latlng.lat),
      lng: Number(state.selectedLocation.latlng.lng),
      priority: 6
    });
  }

  const uniq = new Map();
  for (const c of candidates) {
    const key = `${c.iso}:${Number(c.lat).toFixed(2)}:${Number(c.lng).toFixed(2)}`;
    if (!uniq.has(key)) uniq.set(key, c);
  }

  const densityMap = new Map();
  for (const c of uniq.values()) {
    let nearby = 0;
    for (const x of uniq.values()) {
      if (c === x) continue;
      if (angularDistance(c.lat, c.lng, x.lat, x.lng) < 0.15) nearby += 1;
    }
    densityMap.set(c, nearby);
  }

  const picked = [];
  const lngDelta = (a, b) => Math.abs((((a - b) + 540) % 360) - 180);

  const collides = (a, b) => {
    const densityA = densityMap.get(a) || 0;
    const densityB = densityMap.get(b) || 0;
    const crowdFactor = Math.min(1.5, 1 + (densityA + densityB) * 0.06);
    const latGap = Math.abs(a.lat - b.lat);
    const cosLat = Math.max(0.25, Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180));
    const lngGap = lngDelta(a.lng, b.lng) * cosLat;
    const minGap = (isMobile ? 11 : 8.4) * crowdFactor;
    return latGap < minGap && lngGap < minGap;
  };

  for (const c of [...uniq.values()].sort((a, b) => {
    const pa = b.priority || 1;
    const pb = a.priority || 1;
    if (pa !== pb) return pa - pb;
    return (densityMap.get(a) || 0) - (densityMap.get(b) || 0);
  })) {
    const tooClose = picked.some((p) => collides(c, p));
    if (!tooClose) {
      const density = densityMap.get(c) || 0;
      const base = isMobile ? 0.72 : 0.86;
      const priorityBoost = (c.priority || 1) >= 5 ? 0.06 : 0;
      c.labelScale = Math.max(0.52, base - Math.min(0.24, density * 0.025) + priorityBoost);
      picked.push(c);
    }
    if (picked.length >= (isMobile ? 18 : 34)) break;
  }

  labelPoints = picked;
}

function applyLabels() {
  const labels = state.labelsVisible ? labelPoints : [];
  globe.labelsData(labels);
  if (htmlLabelsSupported) {
    globe.htmlElementsData(labels);
  }
}

function refreshLabels(anchor = state.globeCenter) {
  buildLabelPoints(anchor);
  applyLabels();
}

function updateSelectedCountry(iso) {
  state.selectedLocation.code = iso || '';
  refreshLabels(state.globeCenter);
}

function setPingVisual(lat, lng, color = '#ffd166', countryCenter = null) {
  const ringPayload = [
    {
      lat,
      lng,
      color: 'rgba(216, 175, 98, 0.26)',
      maxRadius: 2.8,
      speed: 0.75,
      repeatPeriod: 1500
    }
  ];

  if (countryCenter?.lat != null && countryCenter?.lng != null) {
    ringPayload.push({
      lat: countryCenter.lat,
      lng: countryCenter.lng,
      color: 'rgba(255, 209, 120, 0.16)',
      maxRadius: 5.2,
      speed: 0.55,
      repeatPeriod: 1850
    });
  }

  globe.pointsData([
    { lat, lng, color: 'rgba(255, 214, 138, 0.16)', radius: 0.9, altitude: 0.028 },
    { lat, lng, color, radius: 0.4, altitude: 0.042 }
  ]);
  globe.ringsData(isMobile ? ringPayload.slice(0, 1) : ringPayload);
}

function resizeGlobe() {
  globe.width(globeMount.clientWidth || window.innerWidth);
  globe.height(globeMount.clientHeight || window.innerHeight);
}

function focusGlobe(lat, lng, altitude = 1.35) {
  globe.pointOfView({ lat, lng, altitude }, 420);
}

function getCurrentCenter() {
  const pov = globe.pointOfView() || {};
  return {
    lat: Number(pov.lat) || 0,
    lng: Number(pov.lng) || 0
  };
}

function getReticleTarget() {
  return getCurrentCenter();
}

function updateCenterUI() {
  const c = getCurrentCenter();
  state.globeCenter = { lat: c.lat, lng: c.lng };

  if (state.labelsVisible && Date.now() - state.lastLabelRefresh > 2200) {
    state.lastLabelRefresh = Date.now();
    refreshLabels(c);
  }

  if (state.mode === 'globe') {
    const nearest = findNearestCountry(c.lat, c.lng);
    regionChip.textContent = nearest ? `Region: ${nearest.label}` : 'Region: Open ocean';
  }
}

function setLocationBadge(text) {
  locationBadge.textContent = text || 'World View';
}

function buildShareUrl() {
  const loc = state.selectedLocation;
  if (!loc?.latlng) return window.location.origin;

  const params = new URLSearchParams();
  if (loc.code && loc.code.length === 2) params.set('loc', loc.code);
  params.set('lat', String(Number(loc.latlng.lat).toFixed(4)));
  params.set('lng', String(Number(loc.latlng.lng).toFixed(4)));

  return `${window.location.origin}/?${params.toString()}`;
}

function updateSharePingVisibility() {
  const show = state.feedScope === 'local' && state.selectedLocation?.type !== 'world';
  sharePingBtn?.classList.toggle('hidden', !show);
}

function renderFeed(stories = []) {
  feedList.innerHTML = '';

  if (!stories.length) {
    feedList.innerHTML = '<li class="feed-item"><a href="#">No live headlines yet.</a><small>Try refresh in a moment.</small></li>';
    return;
  }

  for (const [idx, story] of stories.entries()) {
    const li = document.createElement('li');
    li.className = 'feed-item';
    li.innerHTML = `
      <a href="${story.link}" target="_blank" rel="noopener noreferrer">${story.title}</a>
      <small>${story.source || 'Source'} · ${toDate(story.published)}</small>
    `;
    feedList.appendChild(li);

    if ((idx + 1) % 7 === 0) {
      // Native ad slot placeholder for future monetization injection.
      const ad = document.createElement('li');
      ad.className = 'ad-slot';
      ad.textContent = 'Sponsored slot reserved';
      feedList.appendChild(ad);
    }
  }
}

function openFeedSheet(title = 'Drudge · World') {
  feedTitle.textContent = title;
  feedSheet.classList.remove('hidden');
  feedSheet.setAttribute('aria-hidden', 'false');
  feedSheet.style.opacity = '0';
  feedSheet.style.transform = 'translateY(24px)';
  requestAnimationFrame(() => {
    feedSheet.style.opacity = '1';
    feedSheet.style.transform = 'translateY(0)';
  });
  state.mode = 'feed';
}

function closeFeedSheet() {
  feedSheet.style.opacity = '0';
  feedSheet.style.transform = 'translateY(24px)';
  setTimeout(() => {
    feedSheet.style.transform = '';
    feedSheet.style.opacity = '';
    feedSheet.classList.add('hidden');
    feedSheet.setAttribute('aria-hidden', 'true');
  }, 140);
  state.mode = 'globe';
}

function savePing(name, lat, lng) {
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const item = { name, lat, lng, ts: Date.now(), key };

  state.savedPings = [item, ...state.savedPings.filter((p) => p.key !== key)].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.savedPings));
  renderSavedPings();
}

function loadSavedPings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const maxAgeMs = 1000 * 60 * 60 * 24 * 45;
    const now = Date.now();
    const cleaned = (Array.isArray(raw) ? raw : [])
      .filter((p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng)))
      .map((p) => ({
        name: String(p.name || 'Pinned location'),
        lat: Number(p.lat),
        lng: Number(p.lng),
        ts: Number(p.ts) || Date.now(),
        key: p.key || `${Number(p.lat).toFixed(2)},${Number(p.lng).toFixed(2)}`
      }))
      .filter((p) => now - p.ts < maxAgeMs)
      .slice(0, 12);

    state.savedPings = cleaned;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    state.savedPings = [];
  }
}

function saveFeedCache(stories = []) {
  try {
    localStorage.setItem(
      FEED_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        stories: Array.isArray(stories) ? stories.slice(0, 40) : []
      })
    );
  } catch {
    // Ignore storage quota issues.
  }
}

function loadFeedCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(FEED_CACHE_KEY) || 'null');
    const stories = Array.isArray(raw?.stories) ? raw.stories : [];
    if (stories.length) {
      state.feed = stories;
      state.lastFetchTimestamp = Number(raw?.ts) || 0;
    }
  } catch {
    // Ignore invalid cache.
  }
}

function loadSelectedLocation() {
  const params = new URLSearchParams(window.location.search);
  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const qLat = latParam == null ? Number.NaN : Number(latParam);
  const qLng = lngParam == null ? Number.NaN : Number(lngParam);
  const qLoc = (params.get('loc') || '').toUpperCase();

  if (Number.isFinite(qLat) && Number.isFinite(qLng)) {
    state.selectedLocation = {
      type: qLoc ? 'country' : 'region',
      code: qLoc || '',
      name: qLoc || 'Shared Ping',
      latlng: { lat: qLat, lng: qLng }
    };
    return;
  }

  // Deterministic app start: always launch in World View unless explicitly deep-linked.
  state.selectedLocation = {
    type: 'world',
    code: '',
    name: 'World View',
    latlng: { lat: 20, lng: 0 }
  };
}

function renderSavedPings() {
  if (!state.savedPings.length) {
    savedList.innerHTML = '<div class="result-btn">No saved pings yet.</div>';
    return;
  }

  savedList.innerHTML = state.savedPings
    .map(
      (p, i) => `<button class="saved-btn" data-saved-index="${i}" type="button">${p.name}</button>`
    )
    .join('');

  savedList.querySelectorAll('[data-saved-index]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.savedIndex);
      const ping = state.savedPings[idx];
      if (!ping) return;
      closeSearchModal();
      await pingAt(ping.lat, ping.lng, ping.name, ping.name);
    });
  });
}

function cancelActiveFetch() {
  if (activeFetchController) {
    activeFetchController.abort();
    activeFetchController = null;
  }
}

async function fetchJSON(url, timeoutMs = 9000, options = {}) {
  const { exclusive = false } = options;
  if (exclusive) {
    cancelActiveFetch();
  }

  const controller = new AbortController();
  if (exclusive) {
    activeFetchController = controller;
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store'
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  } finally {
    clearTimeout(timer);
    if (exclusive && activeFetchController === controller) {
      activeFetchController = null;
    }
  }
}

async function loadSignalFeed() {
  const req = ++activeRequest;
  setLoading(true);
  hideStatus();
  lastFeedLoader = loadSignalFeed;
  state.feedScope = 'global';
  updateSharePingVisibility();
  openFeedSheet('Drudge · World');
  renderFeed(state.feed);

  try {
    const data = await fetchJSON('/api/signal', 9000, { exclusive: true });
    if (req !== activeRequest) return;

    state.feed = data.stories || [];
    state.lastFetchTimestamp = Date.now();
    saveFeedCache(state.feed);
    renderFeed(state.feed);
    openFeedSheet('Drudge · World');
  } catch {
    if (req === activeRequest) {
      try {
        const backup = await fetchJSON('/api/news?country=US&name=World', 9000, { exclusive: true });
        if (req !== activeRequest) return;
        state.feed = backup.stories || state.feed;
        saveFeedCache(state.feed);
        renderFeed(state.feed);
        openFeedSheet('Drudge · World');
      } catch {
        renderFeed(state.feed);
        showStatus('Feeds temporarily unavailable — showing last known headlines.');
        openFeedSheet('Drudge · World');
      }
    }
  } finally {
    if (req === activeRequest) setLoading(false);
  }
}

async function loadCountryFeed(code, name, center) {
  const req = ++activeRequest;
  setLoading(true);
  hideStatus();
  openFeedSheet(`Drudge · ${name}`);
  renderFeed(state.feed);

  state.selectedLocation = {
    type: 'country',
    code,
    name,
    latlng: center
  };
  setLocationBadge(name);
  updateSelectedCountry(code);
  setPingVisual(center.lat, center.lng, '#ffd166', center);
  focusGlobe(center.lat, center.lng, 1.35);
  regionChip.textContent = `Region: ${name}`;
  savePing(name, center.lat, center.lng);
  state.feedScope = 'local';
  updateSharePingVisibility();

  lastFeedLoader = () => loadCountryFeed(code, name, center);

  try {
    const data = await fetchJSON(`/api/news?country=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`, 9000, {
      exclusive: true
    });
    if (req !== activeRequest) return;
    state.feed = data.stories || [];
    saveFeedCache(state.feed);
    renderFeed(state.feed);
    openFeedSheet(`Drudge · ${name}`);
  } catch {
    if (req === activeRequest) {
      renderFeed(state.feed);
      showStatus('Feeds temporarily unavailable — showing last known headlines.');
      openFeedSheet(`Drudge · ${name}`);
    }
  } finally {
    if (req === activeRequest) setLoading(false);
  }
}

async function pingAt(lat, lng, labelHint = '', queryHint = '') {
  const req = ++activeRequest;
  setLoading(true);
  hideStatus();

  const nearest = findNearestCountry(lat, lng);

  setPingVisual(lat, lng, '#ffd166', nearest ? { lat: nearest.lat, lng: nearest.lng } : null);
  focusGlobe(lat, lng, 1.34);
  if (nearest?.iso) {
    updateSelectedCountry(nearest.iso);
    regionChip.textContent = `Region: ${nearest.label}`;
  }

  state.feedScope = 'local';
  updateSharePingVisibility();
  openFeedSheet(`Drudge · ${labelHint || nearest?.label || 'Nearby'}`);
  renderFeed(state.feed);

  lastFeedLoader = () => pingAt(lat, lng, labelHint, queryHint);

  try {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (labelHint) params.set('label', labelHint);
    if (queryHint) params.set('q', queryHint);

    const data = await fetchJSON(`/api/nearby-news?${params.toString()}`, 9000, { exclusive: true });
    if (req !== activeRequest) return;

    const finalName = labelHint || data.location || nearest?.label || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    state.selectedLocation = {
      type: 'region',
      code: data.code || nearest?.iso || state.selectedLocation.code,
      name: finalName,
      latlng: { lat, lng }
    };
    setLocationBadge(finalName);
    savePing(finalName, lat, lng);

    state.feed = data.stories || [];
    saveFeedCache(state.feed);
    renderFeed(state.feed);
    openFeedSheet(`Drudge · ${finalName}`);
  } catch {
    if (req === activeRequest) {
      renderFeed(state.feed);
      showStatus('Feeds temporarily unavailable — showing last known headlines.');
      openFeedSheet('Drudge · Nearby');
    }
  } finally {
    if (req === activeRequest) setLoading(false);
  }
}

async function selectCountry(iso, name, lat, lng) {
  await loadCountryFeed(iso, name, { lat, lng });
}

async function runSearch() {
  const query = (searchInput.value || '').trim();
  if (query.length < 2) {
    searchResults.innerHTML = '<div class="result-btn">Type at least 2 characters.</div>';
    return;
  }

  searchResults.innerHTML = '<div class="result-btn">Searching…</div>';

  try {
    const data = await fetchJSON(`/api/lookup?q=${encodeURIComponent(query)}`);
    const places = data.places || [];

    if (!places.length) {
      searchResults.innerHTML = '<div class="result-btn">No matching places.</div>';
      return;
    }

    searchResults.innerHTML = places
      .map(
        (p, i) => `<button class="result-btn" data-place-index="${i}" type="button">${p.label}</button>`
      )
      .join('');

    searchResults.querySelectorAll('[data-place-index]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.placeIndex);
        const place = places[idx];
        if (!place) return;

        closeSearchModal();
        await pingAt(
          Number(place.lat),
          Number(place.lng),
          place.label,
          [place.city, place.state, place.country].filter(Boolean).join(' ')
        );
      });
    });
  } catch {
    searchResults.innerHTML = '<div class="result-btn">Search unavailable right now.</div>';
  }
}

function openSearchModal() {
  searchModal.classList.remove('hidden');
  searchModal.setAttribute('aria-hidden', 'false');
  searchInput.focus();
}

function closeSearchModal() {
  searchModal.classList.add('hidden');
  searchModal.setAttribute('aria-hidden', 'true');
}

function bindEvents() {
  let pullStartY = null;
  let pullDelta = 0;
  let closeStartY = null;
  let closeDelta = 0;

  window.addEventListener('resize', resizeGlobe);

  pingCenterBtn.addEventListener('click', async () => {
    const target = getReticleTarget();
    await pingAt(target.lat, target.lng, '', '');
  });

  labelsToggleBtn.addEventListener('click', () => {
    state.labelsVisible = !state.labelsVisible;
    labelsToggleBtn.textContent = state.labelsVisible ? '🗺 Labels On' : '🗺 Labels Off';
    labelsToggleBtn.classList.toggle('active', state.labelsVisible);
    if (state.labelsVisible) {
      refreshLabels(state.globeCenter);
    } else {
      applyLabels();
    }
  });

  openSignalBtn.addEventListener('click', () => {
    if (state.selectedLocation?.type !== 'world' && state.feedScope === 'local') {
      openFeedSheet(`Drudge · ${state.selectedLocation.name}`);
      renderFeed(state.feed);
      return;
    }
    loadSignalFeed();
  });
  closeFeedBtn.addEventListener('click', closeFeedSheet);

  sharePingBtn?.addEventListener('click', async () => {
    const url = buildShareUrl();
    const title = state.selectedLocation?.name || 'World View';
    const text = `Check this location on Click World News: ${title}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Click World News', text, url });
      } else {
        await navigator.clipboard.writeText(url);
        showStatus('Share link copied to clipboard.');
        setTimeout(() => hideStatus(), 2200);
      }
    } catch {
      // User cancelled share sheet.
    }
  });

  refreshFeedBtn.addEventListener('click', () => {
    if (typeof lastFeedLoader === 'function') {
      lastFeedLoader();
      return;
    }
    loadSignalFeed();
  });

  openSearchBtn.addEventListener('click', openSearchModal);
  closeSearchBtn.addEventListener('click', closeSearchModal);

  searchSubmitBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });

  clearSavedBtn.addEventListener('click', () => {
    state.savedPings = [];
    localStorage.setItem(STORAGE_KEY, '[]');
    renderSavedPings();
  });

  searchModal.addEventListener('click', (event) => {
    if (event.target === searchModal) closeSearchModal();
  });

  feedSheet.addEventListener(
    'touchstart',
    (event) => {
      if (feedSheet.classList.contains('hidden')) return;
      if (feedSheet.scrollTop <= 0) {
        pullStartY = event.touches[0].clientY;
        pullDelta = 0;
      }
    },
    { passive: true }
  );

  feedSheet.addEventListener(
    'touchmove',
    (event) => {
      if (feedSheet.classList.contains('hidden') || pullStartY == null) return;
      pullDelta = event.touches[0].clientY - pullStartY;
      if (pullDelta > 12 && feedSheet.scrollTop <= 0) {
        setLoading(true);
      }
    },
    { passive: true }
  );

  feedSheet.addEventListener(
    'touchend',
    () => {
      if (pullStartY == null) return;
      if (pullDelta > 78) {
        if (typeof lastFeedLoader === 'function') {
          lastFeedLoader();
        } else {
          loadSignalFeed();
        }
      } else {
        setLoading(false);
      }
      pullStartY = null;
      pullDelta = 0;
    },
    { passive: true }
  );

  sheetHandle?.addEventListener(
    'touchstart',
    (event) => {
      closeStartY = event.touches[0].clientY;
      closeDelta = 0;
    },
    { passive: true }
  );

  sheetHandle?.addEventListener(
    'touchmove',
    (event) => {
      if (closeStartY == null) return;
      closeDelta = event.touches[0].clientY - closeStartY;
      if (closeDelta > 0) {
        feedSheet.style.transform = `translateY(${Math.min(closeDelta, 120)}px)`;
      }
    },
    { passive: true }
  );

  sheetHandle?.addEventListener(
    'touchend',
    () => {
      feedSheet.style.transform = '';
      if (closeDelta > 70) closeFeedSheet();
      closeStartY = null;
      closeDelta = 0;
    },
    { passive: true }
  );
}

async function initCountries() {
  const res = await fetch('/data/countries.geojson');
  const geojson = await res.json();

  polygons = (geojson.features || []).map(normalizeFeature).filter(Boolean);
  globe.polygonsData(polygons);
  buildCountryCenters();
  refreshLabels();
}

async function init() {
  loadFeedCache();
  loadSelectedLocation();
  loadSavedPings();
  renderSavedPings();
  renderFeed(state.feed);
  bindEvents();
  resizeGlobe();

  labelsToggleBtn.classList.add('active');
  labelsToggleBtn.textContent = '🗺 Labels On';

  try {
    await initCountries();
    hideStatus();
    pingCenterBtn.classList.remove('hidden');
  } catch {
    showStatus('Could not load world boundaries right now. Refresh once.');
  }

  clearInterval(centerTimer);
  centerTimer = setInterval(updateCenterUI, 800);
  updateCenterUI();

  if (state.selectedLocation?.type !== 'world') {
    setLocationBadge(state.selectedLocation.name);
    focusGlobe(state.selectedLocation.latlng.lat, state.selectedLocation.latlng.lng, 1.4);
    setPingVisual(state.selectedLocation.latlng.lat, state.selectedLocation.latlng.lng);
    updateSelectedCountry(state.selectedLocation.code);
    state.feedScope = 'local';
  }

  updateSharePingVisibility();
  lastFeedLoader = loadSignalFeed;

  // Warm global feed so first Drudge open is instant.
  if (!state.feed.length) {
    fetchJSON('/api/signal', 7000)
      .then((data) => {
        state.feed = data.stories || [];
        saveFeedCache(state.feed);
      })
      .catch(() => {});
  }

  const params = new URLSearchParams(window.location.search);
  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const qLat = latParam == null ? Number.NaN : Number(latParam);
  const qLng = lngParam == null ? Number.NaN : Number(lngParam);
  if (Number.isFinite(qLat) && Number.isFinite(qLng)) {
    await pingAt(qLat, qLng, state.selectedLocation?.name || '', '');
  }

  if (DEMO_MODE === 'feed') {
    await loadSignalFeed();
  }

  if (DEMO_MODE === 'country') {
    const usFeature = findFeatureByIso('US');
    const center = getFeatureCenter(usFeature);
    if (center) {
      await loadCountryFeed('US', 'United States', center);
    }
  }

  if (DEMO_MODE === 'search') {
    openSearchModal();
  }
}

init();
