const auditForm = document.getElementById('audit-form');
const auditResult = document.getElementById('audit-result');
const leadForm = document.getElementById('lead-form');
const leadStatus = document.getElementById('lead-status');
const header = document.querySelector('.topbar');

const yearNode = document.getElementById('year');
if (yearNode) yearNode.textContent = String(new Date().getFullYear());

const revealNodes = [...document.querySelectorAll('.reveal')];
if ('IntersectionObserver' in window && revealNodes.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.12 }
  );

  for (const node of revealNodes) io.observe(node);
} else {
  for (const node of revealNodes) node.classList.add('in');
}

const topNavLinks = [
  ...document.querySelectorAll('.menu-panel a[href^="#"]'),
  ...document.querySelectorAll('.nav-actions a[href^="#"]')
];

for (const link of topNavLinks) {
  link.addEventListener('click', (event) => {
    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    const target = document.querySelector(hash);
    if (!target) return;

    event.preventDefault();
    const headerOffset = (header?.offsetHeight || 74) + 8;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (history?.replaceState) history.replaceState(null, '', hash);

    const dropdown = link.closest('.menu-dropdown');
    if (dropdown && dropdown.open) dropdown.open = false;
  });
}

const menuLinks = [...document.querySelectorAll('.menu-panel a')];
for (const link of menuLinks) {
  link.addEventListener('click', () => {
    const dropdown = link.closest('.menu-dropdown');
    if (dropdown && dropdown.open) dropdown.open = false;
  });
}

const addonTabs = [...document.querySelectorAll('.addon-tab')];
for (const tab of addonTabs) {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.target;
    if (!targetId) return;

    for (const t of addonTabs) {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    const panels = [...document.querySelectorAll('.addons-panel')];
    for (const panel of panels) {
      const active = panel.id === targetId;
      panel.classList.toggle('is-active', active);
      if (active) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    }
  });
}

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function readFormData(form) {
  const fd = new FormData(form);
  const data = {};

  for (const [key, value] of fd.entries()) {
    data[key] = typeof value === 'string' ? value.trim() : value;
  }

  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    data[checkbox.name] = checkbox.checked;
  }

  return data;
}

function renderAudit(audit) {
  const priorities = (audit.priorities || [])
    .slice(0, 4)
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong><br />
          <span>${escapeHtml(item.action)}</span>
        </li>`
    )
    .join('');

  const quickWins = (audit.quickWins || []).slice(0, 4).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  const weeklyPlan = (audit.weeklyPlan || []).slice(0, 3).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  const posts = (audit.generatedPosts || [])
    .slice(0, 3)
    .map(
      (post) => `
      <li>
        <strong>${escapeHtml(post.headline)}</strong><br />
        ${escapeHtml(post.body)}
      </li>`
    )
    .join('');

  const breakdown = (audit.scoreBreakdown || [])
    .map(
      (part) => `
      <article class="card">
        <h4>${escapeHtml(part.name || 'Signal')}</h4>
        <p><strong>${escapeHtml(part.points)}/${escapeHtml(part.maxPoints)}</strong></p>
        <p class="muted">${escapeHtml(part.reason || '')}</p>
      </article>`
    )
    .join('');

  const dataGaps = (audit.dataGaps || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');

  auditResult.innerHTML = `
    <h3>${escapeHtml(audit.businessName)} — Audit Summary</h3>
    <div class="score-box">
      <div class="score-pill">${escapeHtml(audit.score)}/100</div>
      <div>
        <p>
          <strong>Grade ${escapeHtml(audit.grade)}</strong>
          ${audit.projectedCallLift ? `· Opportunity: <strong>+${escapeHtml(audit.projectedCallLift)}%</strong>` : ''}
        </p>
        <p class="muted">Mode: <strong>${escapeHtml(audit.modeLabel || 'Estimate')}</strong> · Confidence: <strong>${escapeHtml(audit.confidenceLabel || 'Medium')}</strong></p>
        <p class="muted">Data source: ${escapeHtml(audit.dataSourceSummary || 'self-reported form input')}</p>
        ${audit.liveDataError ? `<p class="muted">Live lookup note: ${escapeHtml(audit.liveDataError)}</p>` : ''}
        <p class="muted">${escapeHtml(audit.summary)}</p>
      </div>
    </div>

    <div class="grid-3">
      <article class="card">
        <h4>Top actions now</h4>
        <ul>${priorities || '<li>No major blockers detected.</li>'}</ul>
      </article>
      <article class="card">
        <h4>Quick wins (48 hours)</h4>
        <ul>${quickWins}</ul>
      </article>
      <article class="card">
        <h4>First 30 days</h4>
        <ul>${weeklyPlan}</ul>
      </article>
    </div>

    <div class="grid-3" style="margin-top:12px;">
      ${breakdown || '<article class="card"><p class="muted">No score breakdown available.</p></article>'}
    </div>

    <div class="grid-3" style="margin-top:12px;">
      <article class="card">
        <h4>Post ideas</h4>
        <ul>${posts}</ul>
      </article>
      <article class="card">
        <h4>Data gaps to improve confidence</h4>
        <ul>${dataGaps || '<li>None — enough data for current estimate.</li>'}</ul>
      </article>
      <article class="card">
        <h4>Need a verified audit?</h4>
        <p class="muted">We can run a deeper, data-backed review and map the exact implementation plan.</p>
        <a href="/gbp-shield/contact.html?offer=not-sure" class="inline-link">Request verified audit support</a>
      </article>
    </div>
  `;

  auditResult.classList.remove('hidden');
  auditResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

auditForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = readFormData(auditForm);
  const submitBtn = auditForm.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Running Audit...';

  try {
    const res = await fetch('/api/gbp/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Audit request failed');
    }

    renderAudit(data.audit);
  } catch {
    auditResult.innerHTML = `<p class="muted">Could not run audit right now. Please try again in a minute.</p>`;
    auditResult.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Run Free Audit';
  }
});

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (leadStatus) leadStatus.textContent = 'Submitting...';

  const payload = readFormData(leadForm);
  payload.source = 'gbp-starter-trial';

  try {
    const res = await fetch('/api/gbp/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not submit');
    }

    if (leadStatus) leadStatus.textContent = 'Success — sending you to onboarding...';
    const email = encodeURIComponent(payload.email || '');
    const business = encodeURIComponent(payload.businessName || '');
    setTimeout(() => {
      window.location.href = `/gbp-shield/signup.html?email=${email}&business=${business}`;
    }, 600);
  } catch {
    if (leadStatus) leadStatus.textContent = 'Submission failed. Please try again or email hello@crownpointlocal.com';
  }
});

function updateOpsEstimator() {
  const actionsNode = document.getElementById('ops-actions');
  const tokensNode = document.getElementById('ops-tokens');
  const rateNode = document.getElementById('ops-rate');
  const supportNode = document.getElementById('ops-support');
  const outputNode = document.getElementById('ops-estimate-output');
  const breakdownNode = document.getElementById('ops-estimate-breakdown');

  if (!actionsNode || !tokensNode || !rateNode || !supportNode || !outputNode) return;

  const actions = Math.max(0, Number.parseFloat(actionsNode.value) || 0);
  const tokensPerAction = Math.max(100, Number.parseFloat(tokensNode.value) || 0);
  const blendedRatePerMillion = Math.max(0, Number.parseFloat(rateNode.value) || 0);
  const supportLevel = supportNode.value;

  const modelUsageCost = actions * (tokensPerAction / 1_000_000) * blendedRatePerMillion;
  const supportFee = supportLevel === 'priority' ? 349 : 199;
  const infrastructureFee = 49;
  const reliabilityBuffer = Math.max(25, modelUsageCost * 0.2);

  const rawMonthly = supportFee + infrastructureFee + modelUsageCost + reliabilityBuffer;
  const minimumFloor = supportLevel === 'priority' ? 399 : 249;
  const recommended = Math.max(minimumFloor, rawMonthly);
  const upperBound = recommended * 1.15;

  const minRounded = Math.round(recommended);
  const maxRounded = Math.round(upperBound);

  outputNode.innerHTML = `Estimated monthly Ops fee: <strong>$${minRounded}–$${maxRounded}</strong>`;

  if (breakdownNode) {
    breakdownNode.textContent = `Model usage ($${Math.round(modelUsageCost)}) + support ($${supportFee}) + infrastructure ($${infrastructureFee}) + reliability buffer ($${Math.round(reliabilityBuffer)})`;
  }
}

for (const id of ['ops-actions', 'ops-tokens', 'ops-rate', 'ops-support']) {
  const node = document.getElementById(id);
  node?.addEventListener('input', updateOpsEstimator);
  node?.addEventListener('change', updateOpsEstimator);
}
updateOpsEstimator();
