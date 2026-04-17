const form = document.getElementById('login-form');
const statusNode = document.getElementById('login-status');
const yearNode = document.getElementById('year');

if (yearNode) yearNode.textContent = String(new Date().getFullYear());

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusNode.textContent = 'Logging in...';

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const res = await fetch('/api/gbp/client/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not login');

    const email = encodeURIComponent(payload.email || '');
    localStorage.setItem('gbp.dashboard.seed', JSON.stringify(data.dashboard || {}));
    window.location.href = `/gbp-shield/dashboard.html?email=${email}`;
  } catch {
    statusNode.textContent = 'Login failed. Please check your email and try again.';
  }
});
