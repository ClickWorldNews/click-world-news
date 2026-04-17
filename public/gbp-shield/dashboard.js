const query = new URLSearchParams(window.location.search);
const email = query.get('email') || 'client@example.com';
const plan = query.get('plan') || 'starter';
const onboarded = query.get('onboarded') === '1';

const yearNode = document.getElementById('year');
if (yearNode) yearNode.textContent = String(new Date().getFullYear());

document.getElementById('welcome-title').textContent = `Dashboard · ${email}`;
document.getElementById('welcome-sub').textContent = 'Your weekly KPI view, action queue, and competitor tracking.';

document.getElementById('plan-label').textContent = `Plan: ${plan[0].toUpperCase()}${plan.slice(1)}`;
document.getElementById('onboard-label').textContent = onboarded
  ? 'Onboarding complete. Weekly execution queue is active.'
  : 'Onboarding pending. Complete your setup details for activation.';

const seedData = JSON.parse(localStorage.getItem('gbp.dashboard.seed') || '{}');
const profile = JSON.parse(localStorage.getItem('gbp.client.profile') || '{}');

const profileViews = Number(seedData.profileViews || 238);
const callActions = Number(seedData.callActions || 39);
const reviewReplies = Number(seedData.reviewReplies || 21);
const score = Number(seedData.score || 74);

document.getElementById('kpi-views').textContent = profileViews;
document.getElementById('kpi-calls').textContent = callActions;
document.getElementById('kpi-replies').textContent = reviewReplies;
document.getElementById('kpi-score').textContent = `${score}/100`;

document.getElementById('bar-complete').style.width = `${Math.min(100, score + 8)}%`;
document.getElementById('bar-posts').style.width = `${Math.min(100, score - 4)}%`;
document.getElementById('bar-reviews').style.width = `${Math.min(100, score - 2)}%`;

const defaultTasks = [
  'Publish this week’s localized GBP post',
  'Reply to all new incoming reviews',
  'Refresh services + categories for top converting city',
  'Review competitor movement and update action plan'
];

const taskList = document.getElementById('task-list');
for (const task of defaultTasks) {
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
