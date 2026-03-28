// ──────────────────────────────────────────────────────
// Safely · banner.ts
//
// Injects a full-width warning banner into the page.
//
// Dev 2 integration surface:
//   import { showBanner, hideBanner } from './banner';
//   showBanner(assessment);   ← call after scan completes
//   hideBanner();             ← call if user navigates away
//
// Or send a message from the background:
//   chrome.tabs.sendMessage(tabId, { type: 'SHOW_BANNER', assessment });
// ──────────────────────────────────────────────────────

interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;
  reasons: string[];
  action: string;
}

const BANNER_ID = 'safely-warning-banner';
const SPACER_ID = 'safely-warning-spacer';

// ── Message listener (called from background) ─────────

chrome.runtime.onMessage.addListener(
  (message: { type: string; assessment?: RiskAssessment }, _sender, sendResponse) => {
    if (message.type === 'SHOW_BANNER' && message.assessment) {
      showBanner(message.assessment);
      sendResponse({ ok: true });
    }
    if (message.type === 'HIDE_BANNER') {
      hideBanner();
      sendResponse({ ok: true });
    }
    return true;
  },
);

// ── Public API ────────────────────────────────────────

export function showBanner(assessment: RiskAssessment): void {
  hideBanner(); // remove any existing banner first

  if (assessment.verdict === 'SAFE') return; // no banner for safe pages

  const isHighRisk   = assessment.verdict === 'HIGH RISK';
  const isDismissible = !isHighRisk; // SUSPICIOUS = dismissible, HIGH RISK = not
  const topReasons   = assessment.reasons.slice(0, 2);

  // ── Build banner element ──────────────────────────
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('data-verdict', assessment.verdict);

  // Top row: brand + verdict pill + optional dismiss
  const topRow = document.createElement('div');
  topRow.className = 'safely-banner__top';

  const brandEl = document.createElement('span');
  brandEl.className = 'safely-banner__brand';
  brandEl.setAttribute('aria-hidden', 'true');
  brandEl.textContent = '⚠ Safely Warning';

  const verdictPill = document.createElement('span');
  verdictPill.className = 'safely-banner__pill';
  verdictPill.textContent = isHighRisk ? 'HIGH RISK' : 'SUSPICIOUS';

  topRow.appendChild(brandEl);
  topRow.appendChild(verdictPill);

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

  // Reasons list
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
  // Insert as first child of body; add a spacer so
  // fixed/absolute page headers don't cover it.
  document.body.insertBefore(banner, document.body.firstChild);

  // Spacer pushes page content down by banner height
  requestAnimationFrame(() => {
    const h = banner.getBoundingClientRect().height;
    const spacer = document.createElement('div');
    spacer.id = SPACER_ID;
    spacer.style.height = `${h}px`;
    spacer.style.flexShrink = '0';
    document.body.insertBefore(spacer, banner.nextSibling);

    // Fade in
    requestAnimationFrame(() => {
      banner.classList.add('safely-banner--visible');
    });
  });
}

export function hideBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
  document.getElementById(SPACER_ID)?.remove();
}

// ── Internal helpers ──────────────────────────────────

function animateDismiss(banner: HTMLElement): void {
  banner.classList.remove('safely-banner--visible');
  banner.classList.add('safely-banner--exit');
  const spacer = document.getElementById(SPACER_ID);
  if (spacer) {
    spacer.style.transition = 'height 0.25s ease';
    spacer.style.height = '0';
  }
  setTimeout(() => {
    banner.remove();
    spacer?.remove();
  }, 260);
}
