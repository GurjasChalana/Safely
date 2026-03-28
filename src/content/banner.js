// ──────────────────────────────────────────────────────
// Safely · banner.js  (compiled from banner.ts)
//
// Injects a full-width warning banner into the page.
//
// Dev 2: send a message from the background service worker:
//   chrome.tabs.sendMessage(tabId, { type: 'SHOW_BANNER', assessment });
//
// Or call showBanner(assessment) directly if you import this
// module from a content script entry point.
// ──────────────────────────────────────────────────────

const BANNER_ID = 'safely-warning-banner';
const SPACER_ID = 'safely-warning-spacer';

// ── Message listener ──────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SHOW_BANNER' && message.assessment) {
    showBanner(message.assessment);
    sendResponse({ ok: true });
  }
  if (message.type === 'HIDE_BANNER') {
    hideBanner();
    sendResponse({ ok: true });
  }
  return true;
});

// ── showBanner ────────────────────────────────────────

function showBanner(assessment) {
  hideBanner();

  if (assessment.verdict === 'SAFE') return;

  const isHighRisk    = assessment.verdict === 'HIGH RISK';
  const isDismissible = !isHighRisk; // SUSPICIOUS is dismissible; HIGH RISK is not
  const topReasons    = assessment.reasons.slice(0, 2);

  // ── Build banner ──────────────────────────────────
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('data-verdict', assessment.verdict);

  // Top row
  const topRow = document.createElement('div');
  topRow.className = 'safely-banner__top';

  const brandEl = document.createElement('span');
  brandEl.className = 'safely-banner__brand';
  brandEl.setAttribute('aria-hidden', 'true');
  brandEl.textContent = '⚠ Safely Warning';

  const pill = document.createElement('span');
  pill.className = 'safely-banner__pill';
  pill.textContent = isHighRisk ? 'HIGH RISK' : 'SUSPICIOUS';

  topRow.appendChild(brandEl);
  topRow.appendChild(pill);

  if (isDismissible) {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'safely-banner__dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss this warning');
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => animateDismiss(banner));
    topRow.appendChild(dismissBtn);
  }

  // Headline
  const headlineEl = document.createElement('p');
  headlineEl.className = 'safely-banner__headline';
  headlineEl.textContent = isHighRisk
    ? 'Warning: This page may be a scam'
    : 'This page looks suspicious';

  // Reasons
  const reasonsEl = document.createElement('ul');
  reasonsEl.className = 'safely-banner__reasons';
  topReasons.forEach(reason => {
    const li = document.createElement('li');
    li.textContent = reason;
    reasonsEl.appendChild(li);
  });

  // Action
  const actionEl = document.createElement('p');
  actionEl.className = 'safely-banner__action';
  actionEl.textContent = assessment.action;

  banner.appendChild(topRow);
  banner.appendChild(headlineEl);
  if (topReasons.length > 0) banner.appendChild(reasonsEl);
  banner.appendChild(actionEl);

  // ── Inject into page ──────────────────────────────
  document.body.insertBefore(banner, document.body.firstChild);

  // Spacer element so page content shifts down, not under banner
  requestAnimationFrame(() => {
    const h = banner.getBoundingClientRect().height;
    const spacer = document.createElement('div');
    spacer.id = SPACER_ID;
    spacer.style.cssText = `height:${h}px; flex-shrink:0; display:block;`;
    document.body.insertBefore(spacer, banner.nextSibling);

    requestAnimationFrame(() => {
      banner.classList.add('safely-banner--visible');
    });
  });
}

// ── hideBanner ────────────────────────────────────────

function hideBanner() {
  document.getElementById(BANNER_ID)?.remove();
  document.getElementById(SPACER_ID)?.remove();
}

// ── animateDismiss ────────────────────────────────────

function animateDismiss(banner) {
  banner.classList.remove('safely-banner--visible');
  banner.classList.add('safely-banner--exit');
  const spacer = document.getElementById(SPACER_ID);
  if (spacer) {
    spacer.style.transition = 'height 0.25s ease';
    spacer.style.height = '0';
  }
  setTimeout(() => {
    banner.remove();
    if (spacer) spacer.remove();
  }, 260);
}
