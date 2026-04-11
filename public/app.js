const $ = (id) => document.getElementById(id);

const els = {
  mount: $('globe'),
  region: $('region-pill'),
  meta: $('meta-pill'),
  ping: $('ping-btn'),
  labels: $('labels-btn'),
  openNews: $('news-btn'),
  world: $('world-btn'),
  feedSheet: $('feed-sheet'),
  feedTitle: $('feed-title'),
  feedList: $('feed-list'),
  feedLoading: $('feed-loading'),
  closeFeed: $('close-feed'),
  refreshFeed: $('refresh-feed'),
  openSearch: $('open-search'),
  closeSearch: $('close-search'),
  searchModal: $('search-modal'),
  searchInput: $('search-input'),
  searchGo: $('search-go'),
  searchResults: $('search-results')
};

const state = {
  selected: { type: 'world', name: 'World', code: '', lat: 20, lng: 0 },
  labelsOn: true,
  feed: [],
  centers: [],
  byIso: new Map(),
  polygons: [],
  loading: false,
  lastLoader: null,
  activeReq: 0
};

if (typeof window.Globe !== 'function') {
  throw new Error('Globe.gl not loaded');
}

const globe = Globe({
  animateIn: false,
  rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' }
})(els.mount)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('/vendor/earth-balanced-v2.jpg?v=20260411y')
  .bumpImageUrl('/vendor/earth-topology.png?v=20260411y')
  .showAtmosphere(true)
  .atmosphereColor('#b59dff')
  .atmosphereAltitude(0.064)
  .polygonAltitude((f) => (f?.properties?.ISO_A2 === state.selected.code ? 0.045 : 0.0018))
  .polygonCapColor((f) =>
    f?.properties?.ISO_A2 === state.selected.code
      ? 'rgba(255, 134, 213, 0.20)'
      : 'rgba(15, 14, 30, 0.06)'
  )
  .polygonSideColor((f) =>
    f?.properties?.ISO_A2 === state.selected.code
      ? 'rgba(155, 123, 255, 0.24)'
      : 'rgba(10, 9, 22, 0.04)'
  )
  .polygonStrokeColor((f) =>
    f?.properties?.ISO_A2 === state.selected.code
      ? 'rgba(255, 226, 245, 0.94)'
      : 'rgba(198, 175, 255, 0.12)'
  )
  .labelsData([])
  .labelLat((d) => d.lat)
  .labelLng((d) => d.lng)
  .labelText((d) => d.label)
  .labelSize((d) => d.size || 0.7)
  .labelDotRadius(() => 0.08)
  .labelAltitude(() => 0.028)
  .labelColor((d) => d.color || 'rgba(248,240,255,0.95)')
  .pointsData([])
  .pointLat((d) => d.lat)
  .pointLng((d) => d.lng)
  .pointRadius((d) => d.radius)
  .pointAltitude((d) => d.altitude)
  .pointColor((d) => d.color)
  .ringsData([])
  .ringLat((d) => d.lat)
  .ringLng((d) => d.lng)
  .ringColor((d) => (t) => (t < 1 ? d.color : 'transparent'))
  .ringMaxRadius((d) => d.max)
  .ringPropagationSpeed((d) => d.speed)
  .ringRepeatPeriod((d) => d.period)
  .onPolygonClick((feature) => {
    const iso = feature?.properties?.ISO_A2;
    if (!iso) return;
    const name = feature?.properties?.ADMIN || iso;
    const center = state.byIso.get(iso);
    if (!center) return;
    selectCountry({ iso, name, lat: center.lat, lng: center.lng });
  })
  .onGlobeClick((coords) => {
    if (!coords) return;
    pingAt(coords.lat, coords.lng);
  });

if (typeof globe.showGraticules === 'function') globe.showGraticules(false);
if (typeof globe.polygonCapCurvatureResolution === 'function') globe.polygonCapCurvatureResolution(3);

const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = 0.14;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.rotateSpeed = 0.88;
controls.zoomSpeed = 0.88;
controls.minDistance = 118;
controls.maxDistance = 265;

globe.pointOfView({ lat: 20, lng: 0, altitude: 2.02 }, 0);

function styleScene() {
  if (!(window.THREE && typeof globe.scene === 'function')) return;
  const renderer = globe.renderer?.();
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio?.(Math.min(dpr, 1.8));
  }

  const mat = globe.globeMaterial?.();
  if (mat) {
    mat.color?.set?.('#faf8ff');
    mat.emissive?.set?.('#04040f');
    mat.specular?.set?.('#dec9ff');
    mat.shininess = 22;
    mat.bumpScale = 0.32;
    if (mat.map && renderer?.capabilities?.getMaxAnisotropy) {
      mat.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      mat.map.needsUpdate = true;
    }
    mat.needsUpdate = true;
  }

  const scene = globe.scene();
  scene.traverse((obj) => {
    if (obj?.isAmbientLight) {
      obj.color?.set?.('#c1b0ff');
      obj.intensity = 0.14;
    }
    if (obj?.isDirectionalLight) {
      obj.color?.set?.('#e2ecff');
      obj.intensity = 0.9;
      obj.position?.set?.(2.8, 2.0, -2.45);
    }
  });

  if (!scene.userData.magentaRim) {
    const rim = new THREE.DirectionalLight('#ff80ce', 0.30);
    rim.position.set(-3.05, 1.1, 2.55);
    scene.add(rim);
    scene.userData.magentaRim = rim;
  }

  if (!scene.userData.cyanRim) {
    const rim2 = new THREE.DirectionalLight('#72dcff', 0.24);
    rim2.position.set(2.55, -0.35, 2.25);
    scene.add(rim2);
    scene.userData.cyanRim = rim2;
  }
}

function resize() {
  globe.width(els.mount.clientWidth || window.innerWidth);
  globe.height(els.mount.clientHeight || window.innerHeight);
}

function centerOfFeature(feature) {
  const coords = [];
  const walk = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      coords.push(node);
      return;
    }
    node.forEach(walk);
  };
  walk(feature?.geometry?.coordinates);
  if (!coords.length) return null;

  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const sin = coords.reduce((s, c) => s + Math.sin((c[0] * Math.PI) / 180), 0) / coords.length;
  const cos = coords.reduce((s, c) => s + Math.cos((c[0] * Math.PI) / 180), 0) / coords.length;
  const lng = (Math.atan2(sin, cos) * 180) / Math.PI;
  return { lat, lng };
}

function angularDistance(aLat, aLng, bLat, bLng) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestCountry(lat, lng) {
  let best = null;
  let score = Infinity;
  for (const c of state.centers) {
    const d = angularDistance(lat, lng, c.lat, c.lng);
    if (d < score) {
      score = d;
      best = c;
    }
  }
  return best;
}

function updateHud(text = '') {
  const pov = globe.pointOfView();
  const band = pov.altitude <= 1.45 ? 'Local zoom' : pov.altitude <= 1.78 ? 'Country zoom' : 'World zoom';
  const lat = Number(pov.lat || 0).toFixed(2);
  const lng = Number(pov.lng || 0).toFixed(2);
  els.meta.textContent = text || `${band} • ${lat}, ${lng}`;

  if (state.selected.type === 'world') {
    const near = nearestCountry(Number(pov.lat || 0), Number(pov.lng || 0));
    els.region.textContent = near ? `Region: ${near.name}` : 'Region: Open Ocean';
  }
}

function refreshLabels() {
  if (!state.labelsOn) {
    globe.labelsData([]);
    return;
  }

  const pov = globe.pointOfView();
  const lat = Number(pov.lat || 0);
  const lng = Number(pov.lng || 0);
  const altitude = Number(pov.altitude || 2);
  const count = altitude <= 1.45 ? 12 : altitude <= 1.78 ? 9 : 6;

  const picks = [...state.centers]
    .map((c) => ({ ...c, d: angularDistance(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(({ d, ...c }) => ({ label: c.label, lat: c.lat, lng: c.lng, color: 'rgba(248,240,255,0.94)', size: 0.68 }));

  if (state.selected.type !== 'world') {
    picks.push({
      label: state.selected.name,
      lat: state.selected.lat,
      lng: state.selected.lng,
      color: 'rgba(255,216,240,0.98)',
      size: 0.82
    });
  }

  globe.labelsData(picks);
}

function setPing(lat, lng) {
  globe.pointsData([
    { lat, lng, color: 'rgba(255,110,199,0.26)', radius: 0.9, altitude: 0.028 },
    { lat, lng, color: 'rgba(115,220,255,0.95)', radius: 0.35, altitude: 0.05 }
  ]);

  globe.ringsData([
    { lat, lng, color: 'rgba(255,110,199,0.52)', max: 2.8, speed: 0.9, period: 1400 },
    { lat, lng, color: 'rgba(115,220,255,0.42)', max: 3.6, speed: 0.7, period: 1700 }
  ]);
}

function openFeed(title) {
  els.feedTitle.textContent = title;
  els.feedSheet.classList.remove('hidden');
  els.feedSheet.setAttribute('aria-hidden', 'false');
}

function closeFeed() {
  els.feedSheet.classList.add('hidden');
  els.feedSheet.setAttribute('aria-hidden', 'true');
}

function setLoading(flag) {
  state.loading = flag;
  els.feedLoading.classList.toggle('hidden', !flag);
}

function formatDate(v) {
  if (!v) return 'just now';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'just now' : d.toLocaleString();
}

function renderFeed(items) {
  els.feedList.innerHTML = '';
  if (!items?.length) {
    els.feedList.innerHTML = '<li>No headlines yet.</li>';
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a><small>${item.source || 'source'} • ${formatDate(item.published)}</small>`;
    els.feedList.appendChild(li);
  }
}

async function fetchJSON(url, timeout = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function loadGlobalFeed() {
  const req = ++state.activeReq;
  openFeed('World Headlines');
  setLoading(true);
  state.lastLoader = loadGlobalFeed;

  try {
    const data = await fetchJSON('/api/signal', 10000);
    if (req !== state.activeReq) return;
    state.feed = data.stories || [];
  } catch {
    if (req !== state.activeReq) return;
    try {
      const backup = await fetchJSON('/api/news?country=US&name=World', 10000);
      state.feed = backup.stories || [];
    } catch {
      // keep previous stories
    }
  } finally {
    if (req === state.activeReq) {
      renderFeed(state.feed);
      setLoading(false);
      updateHud('Global feed opened');
    }
  }
}

async function loadNearbyFeed(lat, lng, label = '') {
  const req = ++state.activeReq;
  openFeed(`Signal: ${label || 'Nearby'}`);
  setLoading(true);
  state.lastLoader = () => loadNearbyFeed(lat, lng, label);

  try {
    const data = await fetchJSON(`/api/nearby-news?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, 10000);
    if (req !== state.activeReq) return;
    state.feed = data.stories || [];
  } catch {
    if (req !== state.activeReq) return;
  } finally {
    if (req === state.activeReq) {
      renderFeed(state.feed);
      setLoading(false);
    }
  }
}

async function selectCountry({ iso, name, lat, lng }) {
  state.selected = { type: 'country', code: iso, name, lat, lng };
  globe.polygonsData(state.polygons);
  globe.pointOfView({ lat, lng, altitude: 1.44 }, 700);
  setPing(lat, lng);
  els.region.textContent = `Region: ${name}`;
  updateHud(`Country focus • ${lat.toFixed(2)}, ${lng.toFixed(2)}`);
  refreshLabels();
  await loadNearbyFeed(lat, lng, name);
}

async function pingAt(lat, lng) {
  const near = nearestCountry(lat, lng);
  const label = near?.name || 'Nearby';
  state.selected = { type: 'region', code: near?.iso || '', name: label, lat, lng };
  globe.polygonsData(state.polygons);
  globe.pointOfView({ lat, lng, altitude: 1.40 }, 520);
  setPing(lat, lng);
  els.region.textContent = `Region: ${label}`;
  updateHud(`Signal dropped • ${lat.toFixed(2)}, ${lng.toFixed(2)}`);
  refreshLabels();
  await loadNearbyFeed(lat, lng, label);
}

function worldReset() {
  state.selected = { type: 'world', name: 'World', code: '', lat: 20, lng: 0 };
  globe.polygonsData(state.polygons);
  globe.pointOfView({ lat: 20, lng: 0, altitude: 1.98 }, 700);
  globe.pointsData([]);
  globe.ringsData([]);
  els.region.textContent = 'Region: World';
  updateHud('Tap globe to drop signal');
  refreshLabels();
}

function introReveal() {
  globe.pointOfView({ lat: 16, lng: -10, altitude: 2.08 }, 0);
  setTimeout(() => {
    globe.pointOfView({ lat: 20, lng: 0, altitude: 1.98 }, 1300);
  }, 120);
}

function openSearch() {
  els.searchModal.classList.remove('hidden');
  els.searchModal.setAttribute('aria-hidden', 'false');
  els.searchInput.focus();
}

function closeSearch() {
  els.searchModal.classList.add('hidden');
  els.searchModal.setAttribute('aria-hidden', 'true');
}

async function runSearch() {
  const q = String(els.searchInput.value || '').trim();
  if (q.length < 2) {
    els.searchResults.innerHTML = '<div class="result-item">Type at least 2 characters.</div>';
    return;
  }

  els.searchResults.innerHTML = '<div class="result-item">Searching...</div>';

  try {
    const data = await fetchJSON(`/api/lookup?q=${encodeURIComponent(q)}`, 10000);
    const places = data.places || [];
    if (!places.length) {
      els.searchResults.innerHTML = '<div class="result-item">No matches.</div>';
      return;
    }

    els.searchResults.innerHTML = places
      .map((p, i) => `<button class="result-item" data-i="${i}" type="button">${p.label}</button>`)
      .join('');

    els.searchResults.querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = places[Number(btn.dataset.i)];
        closeSearch();
        if (!p) return;
        await pingAt(Number(p.lat), Number(p.lng));
      });
    });
  } catch {
    els.searchResults.innerHTML = '<div class="result-item">Search unavailable right now.</div>';
  }
}

function bind() {
  window.addEventListener('resize', () => {
    resize();
    styleScene();
    refreshLabels();
  });

  els.ping.addEventListener('click', async () => {
    const pov = globe.pointOfView();
    await pingAt(Number(pov.lat || 0), Number(pov.lng || 0));
  });

  els.labels.addEventListener('click', () => {
    state.labelsOn = !state.labelsOn;
    els.labels.textContent = state.labelsOn ? 'Labels On' : 'Labels Off';
    refreshLabels();
  });

  els.openNews.addEventListener('click', async () => {
    if (state.selected.type === 'world') {
      await loadGlobalFeed();
    } else {
      await loadNearbyFeed(state.selected.lat, state.selected.lng, state.selected.name);
    }
  });

  els.world.addEventListener('click', worldReset);
  els.closeFeed.addEventListener('click', closeFeed);
  els.refreshFeed.addEventListener('click', () => (state.lastLoader ? state.lastLoader() : loadGlobalFeed()));

  els.openSearch.addEventListener('click', openSearch);
  els.closeSearch.addEventListener('click', closeSearch);
  els.searchGo.addEventListener('click', runSearch);
  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
  els.searchModal.addEventListener('click', (e) => {
    if (e.target === els.searchModal) closeSearch();
  });

  setInterval(() => {
    updateHud();
    refreshLabels();
  }, 2400);
}

async function loadCountries() {
  const res = await fetch('/data/countries.geojson', { cache: 'force-cache' });
  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];

  state.polygons = features
    .map((f) => {
      const p = f?.properties || {};
      const iso = String(p.ISO_A2 || '').toUpperCase().trim();
      if (!/^[A-Z]{2}$/.test(iso)) return null;
      const name = String(p.ADMIN || p.NAME || iso).trim();
      return { ...f, properties: { ...p, ISO_A2: iso, ADMIN: name, NAME: name } };
    })
    .filter(Boolean);

  globe.polygonsData(state.polygons);

  state.centers = state.polygons
    .map((f) => {
      const c = centerOfFeature(f);
      if (!c) return null;
      return {
        iso: f.properties.ISO_A2,
        name: f.properties.ADMIN,
        label: f.properties.ADMIN,
        lat: c.lat,
        lng: c.lng
      };
    })
    .filter(Boolean);

  state.byIso = new Map(state.centers.map((c) => [c.iso, { lat: c.lat, lng: c.lng }]));
}

async function init() {
  resize();
  styleScene();
  bind();
  await loadCountries();
  introReveal();
  updateHud('Tap globe to drop signal');
  refreshLabels();
  loadGlobalFeed();
}

init();
