const auditForm = document.getElementById('audit-form');
const auditResult = document.getElementById('audit-result');
const leadForm = document.getElementById('lead-form');
const leadStatus = document.getElementById('lead-status');

document.getElementById('year').textContent = String(new Date().getFullYear());

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
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong><br />
          <span>${escapeHtml(item.why)}</span><br />
          <em>Action:</em> ${escapeHtml(item.action)}
          <small>Impact: ${escapeHtml(item.impact)}</small>
        </li>`
    )
    .join('');

  const quickWins = (audit.quickWins || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  const weeklyPlan = (audit.weeklyPlan || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');

  const posts = (audit.generatedPosts || [])
    .slice(0, 6)
    .map(
      (post) => `
      <li>
        <strong>${escapeHtml(post.headline)}</strong><br />
        ${escapeHtml(post.body)}<br />
        <small>CTA: ${escapeHtml(post.cta)}</small>
      </li>`
    )
    .join('');

  const repliesPositive = (audit.reviewReplies?.positive || [])
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join('');

  auditResult.innerHTML = `
    <h3>${escapeHtml(audit.businessName)} — Free Audit Result</h3>
    <div class="score-box">
      <div class="score-pill">${escapeHtml(audit.score)}/100</div>
      <div>
        <p><strong>Grade ${escapeHtml(audit.grade)}</strong> · Estimated lead-lift opportunity: <strong>+${escapeHtml(audit.projectedCallLift)}%</strong></p>
        <p class="muted">${escapeHtml(audit.summary)}</p>
      </div>
    </div>

    <div class="grid-3">
      <article class="card">
        <h4>Top priorities</h4>
        <ul>${priorities || '<li>No major blockers detected.</li>'}</ul>
      </article>
      <article class="card">
        <h4>48-hour quick wins</h4>
        <ul>${quickWins}</ul>
      </article>
      <article class="card">
        <h4>30-day action plan</h4>
        <ul>${weeklyPlan}</ul>
      </article>
    </div>

    <div class="grid-3" style="margin-top:12px;">
      <article class="card">
        <h4>Ready-to-post Google content</h4>
        <ul>${posts}</ul>
      </article>
      <article class="card">
        <h4>Review reply templates (positive)</h4>
        <ul>${repliesPositive}</ul>
      </article>
      <article class="card">
        <h4>What to do next</h4>
        <p class="muted">Launch these changes this week, then track profile views, calls, and review volume weekly. If you want this done-for-you, submit the Founding Beta form below.</p>
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
  payload.source = 'gbp-founding-beta';

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

    leadStatus.textContent = 'Done — we got your details. We will send onboarding steps shortly.';
    leadForm.reset();
  } catch {
    leadStatus.textContent = 'Submission failed. Please try again or email hello@gbpgrowthops.com';
  }
});
