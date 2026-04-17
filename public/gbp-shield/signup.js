const form = document.getElementById('signup-form');
const statusNode = document.getElementById('signup-status');
const yearNode = document.getElementById('year');

if (yearNode) yearNode.textContent = String(new Date().getFullYear());

const qs = new URLSearchParams(window.location.search);
const prefillEmail = qs.get('email');
const prefillBusiness = qs.get('business');
if (prefillEmail) {
  const emailInput = form?.querySelector('input[name="email"]');
  if (emailInput) emailInput.value = prefillEmail;
}
if (prefillBusiness) {
  const businessInput = form?.querySelector('input[name="businessName"]');
  if (businessInput) businessInput.value = prefillBusiness;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusNode.textContent = 'Creating account...';

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const res = await fetch('/api/gbp/client/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not onboard');

    localStorage.setItem('gbp.client.profile', JSON.stringify(payload));
    const email = encodeURIComponent(payload.email || '');
    const plan = encodeURIComponent(payload.plan || 'starter');
    window.location.href = `/gbp-shield/dashboard.html?email=${email}&plan=${plan}&onboarded=1`;
  } catch {
    statusNode.textContent = 'Could not complete signup right now. Please try again in a minute.';
  }
});
