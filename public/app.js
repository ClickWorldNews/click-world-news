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

const ART = {
  oceanA: '#070B16',
  oceanB: '#0C1224',
  oceanC: '#161C2F',
  landA: '#2D3A52',
  landB: '#4A5870',
  landHi: '#C9D3E2',
  goldDim: '#9A7A4A',
  gold: '#C9A46A',
  goldHi: '#E2C08A',
  rimCore: '#F2D8AE',
  rimHalo: '#E7C48A',
  text: '#E7E9EF',
  textSub: '#BFC5D3'
};

const MAJOR_CITY_LABELS = [
  { label: 'New York', lat: 40.7128, lng: -74.0060, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Los Angeles', lat: 34.0522, lng: -118.2437, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'London', lat: 51.5072, lng: -0.1276, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Paris', lat: 48.8566, lng: 2.3522, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Istanbul', lat: 41.0082, lng: 28.9784, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Dubai', lat: 25.2048, lng: 55.2708, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Tokyo', lat: 35.6764, lng: 139.6500, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Seoul', lat: 37.5665, lng: 126.9780, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Mumbai', lat: 19.0760, lng: 72.8777, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Singapore', lat: 1.3521, lng: 103.8198, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'Sydney', lat: -33.8688, lng: 151.2093, color: 'rgba(255, 221, 166, 0.96)' },
  { label: 'São Paulo', lat: -23.5505, lng: -46.6333, color: 'rgba(255, 221, 166, 0.96)' }
];

const STATE_PROVINCE_LABELS = [
  { label: 'California', lat: 36.7783, lng: -119.4179, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Texas', lat: 31.9686, lng: -99.9018, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Florida', lat: 27.6648, lng: -81.5158, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'New York State', lat: 42.9538, lng: -75.5268, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Ontario', lat: 50.0000, lng: -85.0000, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Quebec', lat: 52.9399, lng: -73.5491, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'British Columbia', lat: 53.7267, lng: -127.6476, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Bavaria', lat: 48.7904, lng: 11.4979, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Catalonia', lat: 41.5912, lng: 1.5209, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'Maharashtra', lat: 19.7515, lng: 75.7139, color: 'rgba(240, 248, 255, 0.95)' },
  { label: 'New South Wales', lat: -31.2532, lng: 146.9211, color: 'rgba(240, 248, 255, 0.95)' }
];

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
let isInteracting = false;

if (typeof window.Globe !== 'function') {
  showStatus('Globe engine failed to load. Refresh once or switch network.');
  throw new Error('Globe library unavailable');
}

const globe = Globe({
  animateIn: false,
  rendererConfig: {
    antialias: !isMobile,
    alpha: true,
    powerPreference: 'high-performance'
  }
})(globeMount)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('/vendor/earth-art-a.jpg')
  .bumpImageUrl('/vendor/earth-topology.png')
  .showAtmosphere(true)
  .atmosphereColor(ART.rimCore)
  .atmosphereAltitude(0.075)
  .polygonAltitude((f) => (f?.properties?.ISO_A2 === state.selectedLocation.code ? 0.072 : 0.002))
  .polygonCapColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(226, 192, 138, 0.22)'
      : 'rgba(0, 0, 0, 0)'
  )
  .polygonSideColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(154, 122, 74, 0.12)'
      : 'rgba(0, 0, 0, 0)'
  )
  .polygonStrokeColor((f) =>
    f?.properties?.ISO_A2 === state.selectedLocation.code
      ? 'rgba(226, 192, 138, 0.72)'
      : 'rgba(154, 122, 74, 0.24)'
  )
  .polygonsTransitionDuration(0)
  .labelsData([])
  .labelLat((d) => d.lat)
  .labelLng((d) => d.lng)
  .labelText((d) => d.label)
  .labelSize((d) => {
    const altitude = Number(globe.pointOfView()?.altitude) || 2;
    const base = d?.labelScale ?? (isMobile ? 0.64 : 0.74);
    return Math.max(0.46, base - Math.max(0, altitude - 1.2) * 0.16);
  })
  .labelDotRadius(() => (isMobile ? 0.06 : 0.08))
  .labelAltitude(() => 0.048)
  .labelColor((d) => d?.color || 'rgba(231, 233, 239, 0.95)')
  .labelResolution(isMobile ? 2 : 3)
  .pointsData([])
  .pointLat((d) => d.lat)
  .pointLng((d) => d.lng)
  .pointAltitude((d) => d.altitude ?? 0.035)
  .pointRadius((d) => d.radius ?? 0.45)
  .pointColor((d) => d.color)
  .pointResolution(isMobile ? 8 : 16)
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
globe.pointOfView({ lat: 20, lng: 0, altitude: 1.84 }, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = isMobile ? 0.08 : 0.12;
controls.enablePan = false;
controls.minDistance = 118;
controls.maxDistance = 280;

if (typeof globe.polygonCapCurvatureResolution === 'function') {
  globe.polygonCapCurvatureResolution(isMobile ? 2 : 4);
}

if (typeof globe.showGraticules === 'function') {
  globe.showGraticules(true);
}

if (typeof globe.renderer === 'function') {
  const renderer = globe.renderer();
  if (renderer?.setPixelRatio) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5));
  }
}

function enforceGlobeVisualTheme() {
  if (!(window.THREE && typeof globe.globeMaterial === 'function')) return;

  globe.globeImageUrl('/vendor/earth-art-a.jpg');
  globe.globeMaterial(new THREE.MeshPhongMaterial({
    color: '#202736',
    emissive: '#0c1224',
    specular: '#c9d3e2',
    shininess: 7
  }));

  if (typeof globe.atmosphereMaterial === 'function') {
    globe.showAtmosphere(true);
    globe.atmosphereMaterial(new THREE.MeshPhongMaterial({
      color: ART.rimCore,
      opacity: 0.14,
      transparent: true
    }));
    globe.atmosphereAltitude(0.075);
  }

  if (typeof globe.scene === 'function') {
    const scene = globe.scene();
    if (scene?.traverse) {
      scene.traverse((obj) => {
        if (obj?.isAmbientLight) {
          obj.color?.set?.(ART.textSub);
          obj.intensity = 0.28;
        }
        if (obj?.isDirectionalLight) {
          obj.color?.set?.(ART.rimCore);
          obj.intensity = 0.62;
          if (obj?.position?.set) obj.position.set(2.4, 1.5, -2.6);
        }
      });
    }

    if (window.THREE && !scene.userData.cwnRimLight) {
      const rim = new THREE.DirectionalLight(ART.rimHalo, 0.44);
      rim.position.set(2.9, 1.1, -2.3);
      scene.add(rim);
      scene.userData.cwnRimLight = rim;
    }
  }
}

enforceGlobeVisualTheme();
setTimeout(enforceGlobeVisualTheme, 500);
setTimeout(enforceGlobeVisualTheme, 1500);

controls.addEventListener('start', () => {
  isInteracting = true;
  controls.autoRotate = false;
  clearTimeout(autoRotateTimer);
});

controls.addEventListener('end', () => {
  isInteracting = false;
  enforceGlobeVisualTheme();
  clearTimeout(autoRotateTimer);
  autoRotateTimer = setTimeout(() => {
    controls.autoRotate = true;
    enforceGlobeVisualTheme();
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
    .map((c) => ({ ...c, priority: 3, color: 'rgba(238, 247, 255, 0.96)' }));

  const centerSlice = countryCenters
    .map((c) => ({
      ...c,
      dist: angularDistance(anchor.lat, anchor.lng, c.lat, c.lng),
      priority: 2,
      color: 'rgba(238, 247, 255, 0.96)'
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, isMobile ? 16 : 28)
    .map(({ dist, ...rest }) => rest);

  const citySlice = MAJOR_CITY_LABELS
    .map((c) => ({
      iso: `CITY:${c.label}`,
      label: c.label,
      lat: c.lat,
      lng: c.lng,
      color: c.color,
      dist: angularDistance(anchor.lat, anchor.lng, c.lat, c.lng),
      priority: 2.7
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, isMobile ? 6 : 12)
    .map(({ dist, ...rest }) => rest);

  const stateSlice = STATE_PROVINCE_LABELS
    .map((c) => ({
      iso: `STATE:${c.label}`,
      label: c.label,
      lat: c.lat,
      lng: c.lng,
      color: c.color,
      dist: angularDistance(anchor.lat, anchor.lng, c.lat, c.lng),
      priority: 2.4
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, isMobile ? 5 : 9)
    .map(({ dist, ...rest }) => rest);

  const candidates = [...major, ...centerSlice, ...citySlice, ...stateSlice];

  if (state.selectedLocation.code) {
    const selected = countryCenters.find((c) => c.iso === state.selectedLocation.code);
    if (selected) candidates.push({ ...selected, priority: 5, color: 'rgba(255, 221, 166, 0.98)' });
  }

  if (nearest) candidates.push({ ...nearest, priority: 4, color: 'rgba(245, 251, 255, 0.98)' });

  if (state.selectedLocation?.latlng && state.selectedLocation?.name && state.selectedLocation.type !== 'world') {
    candidates.push({
      iso: `PIN:${state.selectedLocation.code || 'XX'}`,
      label: state.selectedLocation.name,
      lat: Number(state.selectedLocation.latlng.lat),
      lng: Number(state.selectedLocation.latlng.lng),
      priority: 6,
      color: 'rgba(255, 221, 166, 0.98)'
    });
  }

  const uniq = new Map();
  for (const c of candidates) {
    const key = `${c.iso}:${Number(c.lat).toFixed(2)}:${Number(c.lng).toFixed(2)}`;
    if (!uniq.has(key)) uniq.set(key, c);
  }

  const picked = [];
  const spacing = isMobile ? 0.27 : 0.2;
  const ordered = [...uniq.values()].sort((a, b) => (b.priority || 1) - (a.priority || 1));
  const densityByIso = new Map();

  for (const c of ordered) {
    let nearby = 0;
    for (const x of ordered) {
      if (c === x) continue;
      if (angularDistance(c.lat, c.lng, x.lat, x.lng) < (isMobile ? 0.3 : 0.22)) nearby += 1;
    }
    densityByIso.set(c.iso, nearby);
  }

  for (const c of ordered) {
    const tooClose = picked.some((p) => angularDistance(c.lat, c.lng, p.lat, p.lng) < spacing);
    if (!tooClose) {
      const density = densityByIso.get(c.iso) || 0;
      const base = isMobile ? 0.7 : 0.82;
      c.labelScale = Math.max(0.52, base - Math.min(0.22, density * 0.02));
      picked.push(c);
    }
    if (picked.length >= (isMobile ? 16 : 28)) break;
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
      color: 'rgba(216, 175, 98, 0.18)',
      maxRadius: 2.2,
      speed: 0.55,
      repeatPeriod: 1850
    }
  ];

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

  if (!isInteracting && state.labelsVisible && Date.now() - state.lastLabelRefresh > 5200) {
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

function openFeedSheet(title = 'Click News · World') {
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
  openFeedSheet('Click News · World');
  renderFeed(state.feed);

  try {
    const data = await fetchJSON('/api/signal', 9000, { exclusive: true });
    if (req !== activeRequest) return;

    state.feed = data.stories || [];
    state.lastFetchTimestamp = Date.now();
    saveFeedCache(state.feed);
    renderFeed(state.feed);
    openFeedSheet('Click News · World');
  } catch {
    if (req === activeRequest) {
      try {
        const backup = await fetchJSON('/api/news?country=US&name=World', 9000, { exclusive: true });
        if (req !== activeRequest) return;
        state.feed = backup.stories || state.feed;
        saveFeedCache(state.feed);
        renderFeed(state.feed);
        openFeedSheet('Click News · World');
      } catch {
        renderFeed(state.feed);
        showStatus('Feeds temporarily unavailable — showing last known headlines.');
        openFeedSheet('Click News · World');
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
  openFeedSheet(`Click News · ${name}`);
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
    openFeedSheet(`Click News · ${name}`);
  } catch {
    if (req === activeRequest) {
      renderFeed(state.feed);
      showStatus('Feeds temporarily unavailable — showing last known headlines.');
      openFeedSheet(`Click News · ${name}`);
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
  openFeedSheet(`Click News · ${labelHint || nearest?.label || 'Nearby'}`);
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
    openFeedSheet(`Click News · ${finalName}`);
  } catch {
    if (req === activeRequest) {
      renderFeed(state.feed);
      showStatus('Feeds temporarily unavailable — showing last known headlines.');
      openFeedSheet('Click News · Nearby');
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

  openSignalBtn.addEventListener('click', async () => {
    const pov = globe.pointOfView() || {};
    const altitude = Number(pov.altitude) || 2;
    const center = getCurrentCenter();
    const nearest = findNearestCountry(center.lat, center.lng);

    if (state.selectedLocation?.type !== 'world' && state.feedScope === 'local') {
      openFeedSheet(`Click News · ${state.selectedLocation.name}`);
      renderFeed(state.feed);
      return;
    }

    if (altitude <= 1.5 && nearest?.iso && nearest?.label) {
      await loadCountryFeed(nearest.iso, nearest.label, { lat: nearest.lat, lng: nearest.lng });
      return;
    }

    await loadSignalFeed();
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
  centerTimer = setInterval(updateCenterUI, 1800);
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

  // Warm global feed so first Click News open is instant.
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
