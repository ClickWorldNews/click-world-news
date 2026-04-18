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
