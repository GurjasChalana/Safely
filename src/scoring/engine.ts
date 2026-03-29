// ============================================================
// SAFELY — engine.ts
//
// Phase 1: extractFeatures()
//   Reads the live DOM and returns a fully populated
//   ExtractedFeatures object for scoreFeatures() to consume.
//
// Runs in the content-script context (has DOM access).
// Synchronous and fast (< 15 ms). No network calls.
// ============================================================

import type { ExtractedFeatures } from './types';

// ── Known brand → canonical domain ───────────────────────
const BRAND_DOMAINS: Record<string, string> = {
  paypal:          'paypal.com',
  amazon:          'amazon.com',
  google:          'google.com',
  microsoft:       'microsoft.com',
  apple:           'apple.com',
  netflix:         'netflix.com',
  facebook:        'facebook.com',
  instagram:       'instagram.com',
  twitter:         'twitter.com',
  chase:           'chase.com',
  wellsfargo:      'wellsfargo.com',
  bankofamerica:   'bankofamerica.com',
  citibank:        'citi.com',
  americanexpress: 'americanexpress.com',
  ebay:            'ebay.com',
  linkedin:        'linkedin.com',
  dropbox:         'dropbox.com',
  icloud:          'icloud.com',
  outlook:         'outlook.com',
  steam:           'steampowered.com',
  coinbase:        'coinbase.com',
  binance:         'binance.com',
  robinhood:       'robinhood.com',
  venmo:           'venmo.com',
  zelle:           'zellepay.com',
  cashapp:         'cash.app',
  usps:            'usps.com',
  fedex:           'fedex.com',
  ups:             'ups.com',
  irs:             'irs.gov',
  socialsecurity:  'ssa.gov',
};

// ── SSO brands that legitimately appear on many pages ────
// Require 3+ occurrences before flagging.
const SSO_BRANDS = new Set(['google', 'facebook', 'apple', 'instagram', 'twitter', 'linkedin']);

// ── Urgency / pressure language patterns ─────────────────
const URGENCY_PATTERNS: RegExp[] = [
  /\burgent\b/i,
  /\bimmediately\b/i,
  /\bact now\b/i,
  /\blimited time\b/i,
  /\bexpir(e|ed|es|ing)\b/i,
  /\bverify (your )?(account|identity|information|email|details)\b/i,
  /\b(account|access).{0,20}(suspend|lock|disable|block)/i,
  /\b(suspend|lock|disable|block).{0,20}(account|access)/i,
  /\bunusual (activity|sign.?in|login|access)\b/i,
  /\bconfirm (your )?(details|information|account|identity|password)\b/i,
  /\byour account (has been|will be|is being)\b/i,
  /\b(click|tap) here (immediately|now|to verify|to confirm)\b/i,
  /\bwithin 24 hours?\b/i,
  /\bfinal (warning|notice|reminder)\b/i,
  /\bsecurity (alert|warning|breach|notice)\b/i,
  /\bunauthorized (access|activity|login|use)\b/i,
  /\bpassword.{0,20}(compromised|leaked|stolen|exposed)\b/i,
  /\bupdate (your )?(payment|billing|credit card|account)\b/i,
  /\byou have (won|been selected|been chosen)\b/i,
  /\bclaim (your )?(prize|reward|gift|refund)\b/i,
  /\byour (package|parcel|delivery).{0,30}(hold|pending|failed)\b/i,
];

// ── Free/abused TLDs commonly used in phishing ───────────
const SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq',
  'xyz', 'top', 'click', 'link', 'work',
  'date', 'faith', 'review', 'trade', 'stream',
  'science', 'party', 'racing', 'win', 'download',
  'accountant', 'loan', 'bid', 'webcam', 'men',
]);

// ── Sensitive domain keywords ─────────────────────────────
const SENSITIVE_DOMAIN_KEYWORDS = [
  'login', 'signin', 'secure', 'account', 'verify', 'update',
  'bank', 'wallet', 'password', 'confirm', 'billing', 'payment',
  'support', 'recovery', 'authenticate', 'validation',
];

// ── Free hosting platforms ────────────────────────────────
const FREE_HOSTING_DOMAINS = new Set([
  'netlify.app', 'github.io', 'vercel.app', 'glitch.me',
  'web.app', 'firebaseapp.com', 'pages.dev', 'surge.sh',
  'onrender.com', 'railway.app', 'repl.co', 'replit.dev',
]);

// ── Known URL shorteners ──────────────────────────────────
const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
  'buff.ly', 'is.gd', 'short.io', 'rebrand.ly', 'tiny.cc',
  'bl.ink', 'cutt.ly', 'shorte.st', 'adf.ly',
]);

// ============================================================
// PHASE 1 — Feature Extraction
// ============================================================

export function extractFeatures(): ExtractedFeatures {
  const loc      = window.location;
  const domain   = loc.hostname.toLowerCase().replace(/^www\./, '');
  const fullUrl  = loc.href;
  const bodyText = document.body?.innerText ?? '';
  const pageSnippet = bodyText.slice(0, 500);

  const inputs   = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const forms    = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
  const scripts  = Array.from(document.querySelectorAll<HTMLScriptElement>('script'));

  // ── Password / credential fields ─────────────────────────
  const passwordInputs = inputs.filter(i =>
    i.type === 'password' ||
    /\b(password|passwd|pass)\b/i.test(`${i.name} ${i.id} ${i.placeholder}`)
  );
  const hasPasswordField      = passwordInputs.length > 0;
  const hasMultiplePasswordFields = passwordInputs.length >= 2;

  const hasOTPField = inputs.some(i => {
    const fp = `${i.name} ${i.id} ${i.placeholder} ${i.autocomplete ?? ''}`;
    return /\b(otp|one.?time|verif(y|ication).?code|auth.?code|2fa|mfa|passcode|sms.?code)\b/i.test(fp);
  });

  const hasPaymentField =
    inputs.some(i => {
      const fp = `${i.name} ${i.id} ${i.placeholder} ${i.autocomplete ?? ''}`;
      return /\b(card.?number|credit.?card|debit.?card|cvv|cvc|ccv|card.?expir|billing|card.?holder|pan\b)/i.test(fp);
    }) ||
    !!document.querySelector('[data-stripe],[data-braintree],iframe[src*="stripe"],iframe[src*="braintree"]');

  const hasLoginForm =
    hasPasswordField &&
    inputs.some(i =>
      i.type === 'email' ||
      /\b(user(name)?|email|login|account)\b/i.test(`${i.name} ${i.id} ${i.type}`)
    );

  // ── Hidden sensitive fields ───────────────────────────────
  const hasHiddenSensitiveField = inputs.some(i =>
    i.type === 'hidden' &&
    /\b(password|passwd|pass|token|secret|auth|credit|card|cvv|ssn|pin)\b/i
      .test(`${i.name} ${i.id}`)
  );

  // ── Form action checks ────────────────────────────────────
  const hasActionDomainMismatch = forms.some(form => {
    const action = form.action;
    if (!action || action.startsWith('javascript:')) return false;
    try {
      const actionHost = new URL(action).hostname.toLowerCase().replace(/^www\./, '');
      return actionHost !== '' && actionHost !== domain && !actionHost.endsWith(`.${domain}`);
    } catch { return false; }
  });

  const hasDataUriFormAction = forms.some(form =>
    /^data:/i.test(form.getAttribute('action') ?? '')
  );

  // ── URL / Domain signals ──────────────────────────────────
  const urlParts = domain.split('.');
  const tld      = urlParts[urlParts.length - 1] ?? '';
  const sld      = urlParts[urlParts.length - 2] ?? '';

  const isIPAddressURL         = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
  const hasPunycode            = domain.includes('xn--') || fullUrl.toLowerCase().includes('xn--');
  const hasNonStandardPort     = !!loc.port && loc.port !== '80' && loc.port !== '443';
  const isLongUrlPath          = loc.pathname.length > 75;
  const hasAtSymbolInUrl       = fullUrl.includes('@');
  const hasDoubleSlashInPath   = /\/\//.test(loc.pathname);
  const hasUnusualHighRiskTld  = SUSPICIOUS_TLDS.has(tld);
  const hasExcessiveSubdomains = urlParts.length > (tld.length === 2 ? 5 : 4);

  const hasSensitiveKeywordInDomain = SENSITIVE_DOMAIN_KEYWORDS.some(kw =>
    domain.includes(kw)
  );

  const isFreeHostingImpersonation = Array.from(FREE_HOSTING_DOMAINS).some(h =>
    domain.endsWith(h)
  );

  const cameViaUrlShortener =
    URL_SHORTENERS.has(domain) ||
    URL_SHORTENERS.has(document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '');

  // ── Typosquatting ─────────────────────────────────────────
  const hasTyposquatting = (() => {
    for (const [, realDomain] of Object.entries(BRAND_DOMAINS)) {
      const brandSld = realDomain.split('.')[0];
      if (
        domain !== realDomain &&
        !domain.endsWith(`.${realDomain}`) &&
        sld.length >= 4 &&
        Math.abs(sld.length - brandSld.length) <= 2 &&
        levenshtein(sld, brandSld) === 1
      ) return true;
    }
    return false;
  })();

  // ── Subdomain brand impersonation ────────────────────────
  // Brand name appears in subdomain but domain is not the real one
  const hasSubdomainBrandImpersonation = (() => {
    const subdomains = urlParts.slice(0, -2).join('.');
    for (const [brand, realDomain] of Object.entries(BRAND_DOMAINS)) {
      if (
        domain !== realDomain &&
        !domain.endsWith(`.${realDomain}`) &&
        subdomains.includes(brand) &&
        brand.length >= 4
      ) return true;
    }
    return false;
  })();

  // ── Urgency language ─────────────────────────────────────
  const urgencyKeywords = URGENCY_PATTERNS.reduce<string[]>((acc, re) => {
    const m = bodyText.match(re);
    if (m) acc.push(m[0].toLowerCase().slice(0, 60));
    return acc;
  }, []);

  // ── Fake brand detection in page content ─────────────────
  const fakeBrandKeywords = detectFakeBrands(domain, bodyText, document.title);

  // ── Mismatched page title ─────────────────────────────────
  const hasMismatchedPageTitle = (() => {
    const title = document.title.toLowerCase();
    for (const [brand, realDomain] of Object.entries(BRAND_DOMAINS)) {
      if (
        title.includes(brand) &&
        domain !== realDomain &&
        !domain.endsWith(`.${realDomain}`)
      ) return true;
    }
    return false;
  })();

  // ── Favicon mismatch ─────────────────────────────────────
  const hasFaviconMismatch = (() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon?.href) return false;
    try {
      const faviconHost = new URL(favicon.href).hostname.toLowerCase().replace(/^www\./, '');
      return faviconHost !== domain && !faviconHost.endsWith(`.${domain}`);
    } catch { return false; }
  })();

  // ── Link analysis ─────────────────────────────────────────
  const hasMismatchedLinks = detectMismatchedLinks(allLinks);

  const externalLinks = allLinks.filter(a => {
    try {
      const h = new URL(a.href).hostname.toLowerCase().replace(/^www\./, '');
      return h !== domain && !h.endsWith(`.${domain}`);
    } catch { return false; }
  });
  const hasNoExternalLinks = allLinks.length > 5 && externalLinks.length === 0;

  // Dead link ratio — heuristic: links pointing to # or empty href
  const deadLinks = allLinks.filter(a => {
    const href = a.getAttribute('href') ?? '';
    return href === '#' || href === '' || href === 'javascript:void(0)' || href === 'javascript:;';
  });
  const deadLinkRatio = allLinks.length > 0 ? deadLinks.length / allLinks.length : 0;

  // ── Legal / privacy links ─────────────────────────────────
  const allText = Array.from(allLinks).map(a => a.textContent?.toLowerCase() ?? '').join(' ');
  const hasMissingLegalLinks = hasLoginForm &&
    !/\b(privacy|terms|legal|cookie|gdpr)\b/.test(allText);

  // ── Page behavior signals ─────────────────────────────────
  const hasPageTraps =
    window.onbeforeunload !== null ||
    document.querySelectorAll('iframe').length > 6;

  const hasIframeOverlay = Array.from(document.querySelectorAll('iframe')).some(iframe => {
    const style = window.getComputedStyle(iframe);
    return (
      (style.position === 'fixed' || style.position === 'absolute') &&
      parseInt(style.zIndex || '0', 10) > 100
    );
  });

  const hasNoRightClickScript = scripts.some(s =>
    /contextmenu/i.test(s.textContent ?? '')
  ) || document.body?.getAttribute('oncontextmenu') !== null;

  const hasObfuscatedJavascript = scripts.some(s => {
    const src = s.textContent ?? '';
    return /\beval\s*\(/.test(src) || /\batob\s*\(/.test(src) || /\bunescape\s*\(/.test(src);
  });

  // ── HTTPS ────────────────────────────────────────────────
  const httpsEnabled = loc.protocol === 'https:';

  // ── Newly registered domain ───────────────────────────────
  // Cannot check synchronously without a WHOIS API.
  // Set false here; wire up an async pre-check in the background script if needed.
  const isNewlyRegisteredDomain = false;

  return {
    domain,
    fullUrl,
    pageSnippet,
    isIPAddressURL,
    hasPunycode,
    hasNonStandardPort,
    isLongUrlPath,
    hasSensitiveKeywordInDomain,
    hasSubdomainBrandImpersonation,
    hasAtSymbolInUrl,
    hasTyposquatting,
    hasExcessiveSubdomains,
    hasDoubleSlashInPath,
    hasUnusualHighRiskTld,
    cameViaUrlShortener,
    httpsEnabled,
    hasActionDomainMismatch,
    hasHiddenSensitiveField,
    hasDataUriFormAction,
    hasPasswordField,
    hasMultiplePasswordFields,
    hasOTPField,
    hasPaymentField,
    hasLoginForm,
    deadLinkRatio,
    hasNoRightClickScript,
    hasIframeOverlay,
    hasObfuscatedJavascript,
    hasNoExternalLinks,
    hasMissingLegalLinks,
    hasPageTraps,
    hasMismatchedLinks,
    urgencyKeywords,
    fakeBrandKeywords,
    isNewlyRegisteredDomain,
    isFreeHostingImpersonation,
    hasFaviconMismatch,
    hasMismatchedPageTitle,
  };
}

// ── Brand impersonation in page content ───────────────────

function detectFakeBrands(domain: string, bodyText: string, title: string): string[] {
  const combined = `${bodyText} ${title}`.toLowerCase();
  const found: string[] = [];

  for (const [brand, realDomain] of Object.entries(BRAND_DOMAINS)) {
    const onRealDomain =
      domain === realDomain ||
      domain.endsWith(`.${realDomain}`);

    if (onRealDomain) continue;

    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    const occurrences = (combined.match(re) ?? []).length;

    const threshold = SSO_BRANDS.has(brand) ? 3 : 2;
    if (occurrences >= threshold) found.push(brand);
  }

  return found;
}

// ── Mismatched / disguised links ─────────────────────────
// Detects links where visible text looks like a URL
// but the actual href points somewhere else.

function detectMismatchedLinks(links: HTMLAnchorElement[]): boolean {
  let mismatches = 0;

  for (const a of links) {
    const rawHref = a.href;
    const text    = (a.textContent ?? '').trim();
    if (!rawHref || !text || text.length > 100) continue;

    const textLooksLikeUrl =
      /^https?:\/\//i.test(text) ||
      (/\.[a-z]{2,6}(\/|$)/i.test(text) && !/\s/.test(text));

    if (!textLooksLikeUrl) continue;

    try {
      const hrefHost = new URL(rawHref).hostname.toLowerCase().replace(/^www\./, '');
      const textHost = text
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .toLowerCase()
        .replace(/^www\./, '');

      if (hrefHost && textHost && hrefHost !== textHost && !hrefHost.endsWith(`.${textHost}`)) {
        mismatches++;
      }
    } catch { /* malformed URL — skip */ }
  }

  return mismatches >= 2;
}

// ── Levenshtein distance (short strings only) ────────────

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
