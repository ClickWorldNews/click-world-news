const form = document.getElementById('contact-form');
const statusNode = document.getElementById('contact-status');
const yearNode = document.getElementById('year');

if (yearNode) yearNode.textContent = String(new Date().getFullYear());

const qs = new URLSearchParams(window.location.search);
const requestedOffer = qs.get('offer');
if (requestedOffer) {
  const offerSelect = form?.querySelector('select[name="offer"]');
  if (offerSelect && [...offerSelect.options].some((opt) => opt.value === requestedOffer)) {
    offerSelect.value = requestedOffer;
  }
}

function mountSupportBotShortcut() {
  if (document.querySelector('.support-fab')) return;

  const supportUrl = 'https://t.me/Scalpoholic?text=Hi%20Crownpoint%20Local%20Support%2C%20I%20have%20a%20question%20about%20your%20packages.';
  const fab = document.createElement('a');
  fab.href = supportUrl;
  fab.target = '_blank';
  fab.rel = 'noopener noreferrer';
  fab.className = 'support-fab';
  fab.textContent = 'Support Bot';
  fab.setAttribute('aria-label', 'Message support bot on Telegram');
  document.body.appendChild(fab);
}

mountSupportBotShortcut();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusNode.textContent = 'Sending...';

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.source = 'gbp-contact-page';

  try {
    const res = await fetch('/api/gbp/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not submit');

    const preferred = String(payload.preferredChannel || 'email').toLowerCase();
    const channelLabel = preferred === 'telegram'
      ? 'Telegram'
      : preferred === 'sms'
        ? 'SMS/text'
        : preferred === 'dm'
          ? 'DM'
          : 'email';

    statusNode.textContent = `Thanks — we got your message and will reply via ${channelLabel}.`;
    form.reset();
  } catch {
    statusNode.textContent = 'Submission failed. Please try again in a minute.';
  }
});
