// ──────────────────────────────────────────────────────
// Safely · banner.ts
//
// Injects a floating overlay card into the page.
//   HIGH RISK  → centered modal with dark backdrop
//   SUSPICIOUS → bottom-right dismissible card
// ──────────────────────────────────────────────────────

import type { RiskAssessment } from '../shared/types';

const BANNER_ID   = 'safely-warning-banner';
const BACKDROP_ID = 'safely-overlay-backdrop';

// ── Public API ────────────────────────────────────────

export function showBanner(assessment: RiskAssessment): void {
  hideBanner();

  if (assessment.verdict === 'SAFE') return;

  const isHighRisk    = assessment.verdict === 'HIGH RISK';
  const isDismissible = !isHighRisk;
  const topReasons    = assessment.reasons.slice(0, 3);

  // ── Backdrop (HIGH RISK only) ─────────────────────
  if (isHighRisk) {
    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('safely-backdrop--visible'));
  }

  // ── Banner card ───────────────────────────────────
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('aria-modal', isHighRisk ? 'true' : 'false');
  banner.setAttribute('data-verdict', assessment.verdict);

  // Dismiss button (SUSPICIOUS only — top-right corner)
  if (isDismissible) {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'safely-banner__dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss this warning');
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => animateDismiss(banner));
    banner.appendChild(dismissBtn);
  }

  // Icon row: shield + app name + verdict pill
  const iconRow = document.createElement('div');
  iconRow.className = 'safely-banner__icon-row';

  const shield = document.createElement('span');
  shield.className = 'safely-banner__shield';
  shield.setAttribute('aria-hidden', 'true');
  shield.textContent = isHighRisk ? '🛡️' : '⚠️';

  const brandBlock = document.createElement('div');
  brandBlock.className = 'safely-banner__brand-block';

  const appName = document.createElement('span');
  appName.className = 'safely-banner__app-name';
  appName.textContent = 'Safely';

  const pill = document.createElement('span');
  pill.className = 'safely-banner__pill';
  pill.textContent = isHighRisk ? 'HIGH RISK' : 'SUSPICIOUS';

  brandBlock.appendChild(appName);
  brandBlock.appendChild(pill);
  iconRow.appendChild(shield);
  iconRow.appendChild(brandBlock);
  banner.appendChild(iconRow);

  // Divider
  const divider = document.createElement('hr');
  divider.className = 'safely-banner__divider';
  banner.appendChild(divider);

  // Headline
  const headline = document.createElement('p');
  headline.className = 'safely-banner__headline';
  headline.textContent = isHighRisk
    ? 'Warning: This page may be a scam'
    : 'This page looks suspicious';
  banner.appendChild(headline);

  // Reasons list
  if (topReasons.length > 0) {
    const reasonsEl = document.createElement('ul');
    reasonsEl.className = 'safely-banner__reasons';
    topReasons.forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      reasonsEl.appendChild(li);
    });
    banner.appendChild(reasonsEl);
  }

  // Action button
  const actionBtn = document.createElement('div');
  actionBtn.className = 'safely-banner__action-btn';
  actionBtn.textContent = assessment.action;
  banner.appendChild(actionBtn);

  // ── Inject ────────────────────────────────────────
  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.classList.add('safely-banner--visible');
    });
  });
}

export function hideBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
  document.getElementById(BACKDROP_ID)?.remove();
}

// ── Internal helpers ──────────────────────────────────

function animateDismiss(banner: HTMLElement): void {
  banner.classList.remove('safely-banner--visible');
  banner.classList.add('safely-banner--exit');
  setTimeout(() => banner.remove(), 220);
}