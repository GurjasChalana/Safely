// ──────────────────────────────────────────────────────
// Safely Content Script · content.js  (compiled from content.ts)
// Handles in-page warning banner injection.
// ──────────────────────────────────────────────────────

const BANNER_ID = 'safely-warning-banner';

// ── Message listener ──────────────────────────────────
// Dev 2: send { type: 'SHOW_BANNER', result } from the background
//        once analysis is complete.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SHOW_BANNER' && message.result) {
    showBanner(message.result);
    sendResponse({ ok: true });
  }
  if (message.type === 'HIDE_BANNER') {
    removeBanner();
    sendResponse({ ok: true });
  }
  return true;
});

// ── Banner ────────────────────────────────────────────

function showBanner(result) {
  removeBanner();

  if (result.verdict === 'SAFE') return;

  const isHighRisk = result.verdict === 'HIGH RISK';
  const topReasons = result.reasons.slice(0, 3);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('data-verdict', result.verdict);

  // ── Header row ────────────────────────────────────
  const headerRow = document.createElement('div');
  headerRow.className = 'safely-banner__header';

  const left = document.createElement('div');
  left.className = 'safely-banner__left';

  const iconEl = document.createElement('span');
  iconEl.className = 'safely-banner__icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = '⚠';

  const titleGroup = document.createElement('div');

  const brandEl = document.createElement('span');
  brandEl.className = 'safely-banner__brand';
  brandEl.textContent = 'Safely Warning';

  const verdictEl = document.createElement('span');
  verdictEl.className = `safely-banner__verdict safely-banner__verdict--${isHighRisk ? 'high' : 'suspicious'}`;
  verdictEl.textContent = result.verdict;

  titleGroup.appendChild(brandEl);
  titleGroup.appendChild(verdictEl);
  left.appendChild(iconEl);
  left.appendChild(titleGroup);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'safely-banner__dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss warning');
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', () => dismissBanner(banner));

  headerRow.appendChild(left);
  headerRow.appendChild(dismissBtn);

  // ── Reasons list ──────────────────────────────────
  if (topReasons.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'safely-banner__reasons';
    topReasons.forEach((reason) => {
      const li = document.createElement('li');
      li.textContent = reason;
      ul.appendChild(li);
    });
    banner.appendChild(headerRow);
    banner.appendChild(ul);
  } else {
    banner.appendChild(headerRow);
  }

  // ── Action text ───────────────────────────────────
  const actionEl = document.createElement('p');
  actionEl.className = 'safely-banner__action';
  actionEl.textContent = result.action;
  banner.appendChild(actionEl);

  // Insert at top of page
  document.body.insertBefore(banner, document.body.firstChild);

  // Animate in (double rAF ensures transition fires)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.classList.add('safely-banner--visible');
    });
  });
}

function dismissBanner(banner) {
  banner.classList.remove('safely-banner--visible');
  banner.classList.add('safely-banner--dismissing');
  setTimeout(() => banner.remove(), 250);
}

function removeBanner() {
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();
}
