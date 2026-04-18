const query = new URLSearchParams(window.location.search);
const email = query.get('email') || 'client@example.com';
const plan = query.get('plan') || 'starter';
const onboarded = query.get('onboarded') === '1';

const yearNode = document.getElementById('year');
if (yearNode) yearNode.textContent = String(new Date().getFullYear());

document.getElementById('welcome-title').textContent = `Dashboard · ${email}`;
document.getElementById('welcome-sub').textContent = 'Your audit history, action queue, and next-step priorities.';

document.getElementById('plan-label').textContent = `Plan: ${plan[0].toUpperCase()}${plan.slice(1)}`;
document.getElementById('onboard-label').textContent = onboarded
  ? 'Onboarding complete. Weekly execution queue is active.'
  : 'Onboarding pending. Complete your setup details for activation.';

const seedData = JSON.parse(localStorage.getItem('gbp.dashboard.seed') || '{}');
const profile = JSON.parse(localStorage.getItem('gbp.client.profile') || '{}');

const auditRuns = Number(seedData.auditRuns || 0);
const lastAuditScore = Number.isFinite(Number(seedData.lastAuditScore)) ? Number(seedData.lastAuditScore) : null;
const confidencePct = Number.isFinite(Number(seedData.confidencePct)) ? Number(seedData.confidencePct) : null;
const lastUpdated = seedData.lastUpdated ? new Date(seedData.lastUpdated) : null;

const kpiViews = document.getElementById('kpi-views');
const kpiCalls = document.getElementById('kpi-calls');
const kpiReplies = document.getElementById('kpi-replies');
const kpiScore = document.getElementById('kpi-score');

if (kpiViews) kpiViews.textContent = String(auditRuns || 0);
if (kpiCalls) kpiCalls.textContent = lastAuditScore === null ? '--' : `${lastAuditScore}/100`;
if (kpiReplies) kpiReplies.textContent = confidencePct === null ? '--' : `${confidencePct}%`;
if (kpiScore) kpiScore.textContent = lastUpdated && !Number.isNaN(lastUpdated.getTime())
  ? lastUpdated.toLocaleDateString()
  : '--';

const scoreForBars = lastAuditScore ?? 52;
document.getElementById('bar-complete').style.width = `${Math.min(100, scoreForBars)}%`;
document.getElementById('bar-posts').style.width = `${Math.min(100, Math.max(12, scoreForBars - 8))}%`;
document.getElementById('bar-reviews').style.width = `${Math.min(100, Math.max(8, scoreForBars - 4))}%`;

const defaultTasks = [
  'Run a fresh audit this week to update your baseline.',
  'Close one top-priority gap from the latest recommendations.',
  'Keep posting and review response cadence active.',
  'Book a strategy check-in if score has plateaued.'
];

const taskList = document.getElementById('task-list');
const taskItems = Array.isArray(seedData.tasks) && seedData.tasks.length ? seedData.tasks : defaultTasks;
for (const task of taskItems) {
  const li = document.createElement('li');
  li.textContent = task;
  taskList.appendChild(li);
}

const competitorListNode = document.getElementById('competitor-list');
const competitorForm = document.getElementById('competitor-form');
const key = `gbp.competitors.${email}`;
const storedCompetitors = JSON.parse(localStorage.getItem(key) || '[]');
const initialCompetitors = storedCompetitors.length
  ? storedCompetitors
  : (profile.competitors ? String(profile.competitors).split(',').map((x) => x.trim()).filter(Boolean) : []);

function renderCompetitors(items) {
  competitorListNode.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    competitorListNode.appendChild(li);
  }
}

renderCompetitors(initialCompetitors);
localStorage.setItem(key, JSON.stringify(initialCompetitors));

competitorForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const fd = new FormData(competitorForm);
  const value = String(fd.get('competitor') || '').trim();
  if (!value) return;

  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push(value);
  localStorage.setItem(key, JSON.stringify(list));
  renderCompetitors(list);
  competitorForm.reset();
});
