// ──────────────────────────────────────────────────────
// Safely Content Script · content.ts
// Handles in-page warning banner injection.
// ──────────────────────────────────────────────────────

interface AssessmentResult {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;
  reasons: string[];
  action: string;
}

const BANNER_ID = 'safely-warning-banner';

// ── Message listener ──────────────────────────────────
// Dev 2: background should send { type: 'SHOW_BANNER', result: AssessmentResult }
//        after completing analysis.

chrome.runtime.onMessage.addListener(
  (message: { type: string; result?: AssessmentResult }, _sender, sendResponse) => {
    if (message.type === 'SHOW_BANNER' && message.result) {
      showBanner(message.result);
      sendResponse({ ok: true });
    }
    if (message.type === 'HIDE_BANNER') {
      removeBanner();
      sendResponse({ ok: true });
    }
    return true; // keep channel open for async sendResponse
  },
);

// ── Banner ────────────────────────────────────────────

function showBanner(result: AssessmentResult): void {
  removeBanner();

  if (result.verdict === 'SAFE') return;

  const isHighRisk = result.verdict === 'HIGH RISK';
  const topReasons = result.reasons.slice(0, 3);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('data-verdict', result.verdict);

  // Build reasons HTML safely (no innerHTML with raw data)
  const reasonsEl = buildReasonsList(topReasons);

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'safely-banner__header';

  const left = document.createElement('div');
  left.className = 'safely-banner__left';

  const iconEl = document.createElement('span');
  iconEl.className = 'safely-banner__icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = isHighRisk ? '⚠' : '⚠';

  const titleGroup = document.createElement('div');

  const brandEl = document.createElement('span');
  brandEl.className = 'safely-banner__brand';
  brandEl.textContent = 'Safely Warning';

  const verdictEl = document.createElement('span');
  verdictEl.className = `safely-banner__verdict safely-banner__verdict--${result.verdict === 'HIGH RISK' ? 'high' : 'suspicious'}`;
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

  // Action row
  const actionEl = document.createElement('p');
  actionEl.className = 'safely-banner__action';
  actionEl.textContent = result.action;

  banner.appendChild(headerRow);
  if (topReasons.length > 0) banner.appendChild(reasonsEl);
  banner.appendChild(actionEl);

  // Insert before first child of body so it doesn't overlap fixed headers
  document.body.insertBefore(banner, document.body.firstChild);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.classList.add('safely-banner--visible');
    });
  });
}

function buildReasonsList(reasons: string[]): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'safely-banner__reasons';
  reasons.forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = reason;
    ul.appendChild(li);
  });
  return ul;
}

function dismissBanner(banner: HTMLElement): void {
  banner.classList.remove('safely-banner--visible');
  banner.classList.add('safely-banner--dismissing');
  setTimeout(() => banner.remove(), 250);
}

function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}
