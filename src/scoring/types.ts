// ============================================================
// SAFELY — Shared Type Contracts
// Single source of truth. All files import from here.
// ============================================================

export interface ExtractedFeatures {
  // --- Identity ---
  domain: string;
  fullUrl: string;
  pageSnippet: string;          // first 500 chars of body text

  // --- Domain / URL signals ---
  isIPAddressURL: boolean;                 // IP_ADDRESS_URL
  hasPunycode: boolean;                    // PUNYCODE_DETECTION
  hasNonStandardPort: boolean;             // NON_STANDARD_PORT
  isLongUrlPath: boolean;                  // LONG_URL_PATH (path > 75 chars)
  hasSensitiveKeywordInDomain: boolean;    // SENSITIVE_KEYWORD_DOMAIN
  hasSubdomainBrandImpersonation: boolean; // SUBDOMAIN_BRAND_IMPERSONATION
  hasAtSymbolInUrl: boolean;               // URL_CONTAINS_AT_SYMBOL
  hasTyposquatting: boolean;               // TYPOSQUATTING_DETECTION
  hasExcessiveSubdomains: boolean;         // EXCESSIVE_SUBDOMAINS (4+ levels)
  hasDoubleSlashInPath: boolean;           // DOUBLE_SLASH_IN_PATH
  hasUnusualHighRiskTld: boolean;          // UNUSUAL_HIGH_RISK_TLD
  cameViaUrlShortener: boolean;            // URL_SHORTENER_REDIRECT

  // --- HTTPS ---
  httpsEnabled: boolean;                   // HTTPS_MISSING (inverted: false = flag)

  // --- Form / field signals ---
  hasActionDomainMismatch: boolean;        // ACTION_DOMAIN_MISMATCH
  hasHiddenSensitiveField: boolean;        // HIDDEN_SENSITIVE_FIELD
  hasDataUriFormAction: boolean;           // DATA_URI_FORM_ACTION
  hasPasswordField: boolean;               // used in composite signals
  hasMultiplePasswordFields: boolean;      // MULTIPLE_PASSWORD_FIELDS_ON_LOGIN
  hasOTPField: boolean;                    // OTP_FIELD
  hasPaymentField: boolean;                // PAYMENT_FIELD
  hasLoginForm: boolean;                   // used in composite signals

  // --- Page behavior signals ---
  deadLinkRatio: number;                   // DEAD_LINK_RATIO (0.0–1.0, flag if > 0.6)
  hasNoRightClickScript: boolean;          // NO_RIGHT_CLICK_SCRIPT
  hasIframeOverlay: boolean;               // IFRAME_CONTENT_OVERLAY
  hasObfuscatedJavascript: boolean;        // OBFUSCATED_JAVASCRIPT
  hasNoExternalLinks: boolean;             // NO_EXTERNAL_LINKS
  hasMissingLegalLinks: boolean;           // MISSING_PRIVACY_OR_TERMS_LINK
  hasPageTraps: boolean;                   // PAGE_TRAPS (beforeunload / excessive iframes)
  hasMismatchedLinks: boolean;             // MISMATCHED_LINKS

  // --- Content signals ---
  urgencyKeywords: string[];               // URGENCY_LANGUAGE_HIGH / LOW
  fakeBrandKeywords: string[];             // FAKE_BRAND_IN_CONTENT / PASSWORD_ON_FAKE_BRAND

  // --- Domain trust signals ---
  isNewlyRegisteredDomain: boolean;        // NEWLY_REGISTERED_DOMAIN
  isFreeHostingImpersonation: boolean;     // FREE_HOSTING_IMPERSONATION

  // --- Visual signals ---
  hasFaviconMismatch: boolean;             // FAVICON_MISMATCH
  hasMismatchedPageTitle: boolean;         // MISMATCHED_PAGE_TITLE_DOMAIN
}

export interface RiskAssessment {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH RISK';
  score: number;               // raw score (used internally for thresholds)
  displayScore: number;        // normalized 0–100 (shown in UI)
  reasons: string[];           // max 3, plain English
  action: string;              // one clear instruction sentence
  triggeredSignals: SignalKey[];
  domain: string;
}

// Every rule ID — keys across weight / reason / detection maps
export type SignalKey =
  // ── URL / Domain ──
  | 'IP_ADDRESS_URL'
  | 'PUNYCODE_DETECTION'
  | 'NON_STANDARD_PORT'
  | 'LONG_URL_PATH'
  | 'SENSITIVE_KEYWORD_DOMAIN'
  | 'SUBDOMAIN_BRAND_IMPERSONATION'
  | 'URL_CONTAINS_AT_SYMBOL'
  | 'TYPOSQUATTING_DETECTION'
  | 'EXCESSIVE_SUBDOMAINS'
  | 'DOUBLE_SLASH_IN_PATH'
  | 'UNUSUAL_HIGH_RISK_TLD'
  | 'URL_SHORTENER_REDIRECT'
  // ── HTTPS ──
  | 'HTTPS_MISSING'
  // ── Form / Field ──
  | 'ACTION_DOMAIN_MISMATCH'
  | 'HIDDEN_SENSITIVE_FIELD'
  | 'DATA_URI_FORM_ACTION'
  | 'MULTIPLE_PASSWORD_FIELDS_ON_LOGIN'
  | 'OTP_FIELD'
  | 'PAYMENT_FIELD'
  // ── Composite (field + domain context) ──
  | 'PASSWORD_ON_SUSPICIOUS_DOMAIN'
  | 'PASSWORD_ON_FAKE_BRAND'
  // ── Page Behavior ──
  | 'DEAD_LINK_RATIO'
  | 'NO_RIGHT_CLICK_SCRIPT'
  | 'IFRAME_CONTENT_OVERLAY'
  | 'OBFUSCATED_JAVASCRIPT'
  | 'NO_EXTERNAL_LINKS'
  | 'MISSING_PRIVACY_OR_TERMS_LINK'
  | 'PAGE_TRAPS'
  | 'MISMATCHED_LINKS'
  // ── Content ──
  | 'FAKE_BRAND_IN_CONTENT'
  | 'URGENCY_LANGUAGE_HIGH'
  | 'URGENCY_LANGUAGE_LOW'
  // ── Domain Trust ──
  | 'NEWLY_REGISTERED_DOMAIN'
  | 'FREE_HOSTING_IMPERSONATION'
  // ── Visual ──
  | 'FAVICON_MISMATCH'
  | 'MISMATCHED_PAGE_TITLE_DOMAIN';
