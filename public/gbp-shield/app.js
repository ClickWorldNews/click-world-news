const auditForm = document.getElementById('audit-form');
const auditResult = document.getElementById('audit-result');
const leadForm = document.getElementById('lead-form');
const leadStatus = document.getElementById('lead-status');
const header = document.querySelector('.topbar');

document.getElementById('year').textContent = String(new Date().getFullYear());

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

  const repliesPositive = (audit.reviewReplies?.positive || [])
    .slice(0, 2)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join('');

  auditResult.innerHTML = `
    <h3>${escapeHtml(audit.businessName)} — Audit Summary</h3>
    <div class="score-box">
      <div class="score-pill">${escapeHtml(audit.score)}/100</div>
      <div>
        <p><strong>Grade ${escapeHtml(audit.grade)}</strong> · Estimated lead-lift opportunity: <strong>+${escapeHtml(audit.projectedCallLift)}%</strong></p>
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
      <article class="card">
        <h4>Post ideas</h4>
        <ul>${posts}</ul>
      </article>
      <article class="card">
        <h4>Review reply examples</h4>
        <ul>${repliesPositive}</ul>
      </article>
      <article class="card">
        <h4>Want this done-for-you?</h4>
        <p class="muted">Use the Step 2 form below to start weekly managed execution with the Starter Plan.</p>
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
  } catch (error) {
    auditResult.innerHTML = `<p class="muted">Could not run audit right now. Please try again in a minute.</p>`;
    auditResult.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Run Free Audit';
  }
});

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  leadStatus.textContent = 'Submitting...';

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

    leadStatus.textContent = 'Success — sending you to onboarding...';
    const email = encodeURIComponent(payload.email || '');
    const business = encodeURIComponent(payload.businessName || '');
    setTimeout(() => {
      window.location.href = `/gbp-shield/signup.html?email=${email}&business=${business}`;
    }, 600);
  } catch {
    leadStatus.textContent = 'Submission failed. Please try again or email hello@gbpgrowthops.com';
  }
});
