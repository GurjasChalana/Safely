"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeReasons = mergeReasons;
exports.getSafeBrowsingReason = getSafeBrowsingReason;
exports.applySafeBrowsingResult = applySafeBrowsingResult;
const HIGH_RISK_ACTION = 'Do not enter any information. Close this tab immediately.';
const SAFE_BROWSING_SCORE = 85;
const SAFE_BROWSING_DISPLAY_SCORE = 90;
function appendUnique(values, value) {
    return values.includes(value) ? values : [...values, value];
}
function normalizeReason(reason) {
    return reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}
function hasSimilarReason(reasons, candidate, threatType) {
    const normalizedCandidate = normalizeReason(candidate);
    return reasons.some(reason => {
        const normalizedReason = normalizeReason(reason);
        if (normalizedReason === normalizedCandidate) {
            return true;
        }
        if (threatType === 'SOCIAL_ENGINEERING') {
            return normalizedReason.includes('social engineering')
                || normalizedReason.includes('phishing');
        }
        if (threatType === 'MALWARE') {
            return normalizedReason.includes('malware');
        }
        return normalizedReason.includes('google safe browsing');
    });
}
function mergeReasons(primary, secondary, limit = 3) {
    const merged = [];
    for (const reason of [...primary, ...secondary]) {
        const trimmed = reason.trim();
        if (!trimmed) {
            continue;
        }
        const normalized = normalizeReason(trimmed);
        if (merged.some(existing => normalizeReason(existing) === normalized)) {
            continue;
        }
        merged.push(trimmed);
        if (merged.length >= limit) {
            break;
        }
    }
    return merged;
}
function getSafeBrowsingReason(match) {
    switch (match?.threatType) {
        case 'SOCIAL_ENGINEERING':
            return 'Google Safe Browsing flagged this URL for social engineering.';
        case 'MALWARE':
            return 'Google Safe Browsing flagged this URL for malware risk.';
        default:
            return 'Google Safe Browsing flagged this URL as unsafe.';
    }
}
function getPrimaryMatch(matches) {
    const priority = ['SOCIAL_ENGINEERING', 'MALWARE', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];
    return [...matches].sort((left, right) => {
        const leftIndex = priority.indexOf(left.threatType ?? '');
        const rightIndex = priority.indexOf(right.threatType ?? '');
        return (leftIndex === -1 ? priority.length : leftIndex)
            - (rightIndex === -1 ? priority.length : rightIndex);
    })[0];
}
function applySafeBrowsingResult(assessment, safeBrowsing) {
    const next = {
        ...assessment,
        safeBrowsing,
    };
    if (safeBrowsing.error || safeBrowsing.safe || safeBrowsing.matches.length === 0) {
        return next;
    }
    const primaryMatch = getPrimaryMatch(safeBrowsing.matches);
    const reason = getSafeBrowsingReason(primaryMatch);
    const reasons = hasSimilarReason(next.reasons, reason, primaryMatch?.threatType)
        ? next.reasons
        : mergeReasons([reason], next.reasons);
    return {
        ...next,
        verdict: 'HIGH RISK',
        score: Math.max(next.score, SAFE_BROWSING_SCORE),
        displayScore: Math.max(next.displayScore, SAFE_BROWSING_DISPLAY_SCORE),
        reasons,
        action: HIGH_RISK_ACTION,
        triggeredSignals: appendUnique(next.triggeredSignals, `SAFE_BROWSING_${primaryMatch?.threatType ?? 'UNSAFE'}`),
    };
}
