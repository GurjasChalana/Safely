# Safely Chrome Extension

## Safe Browsing

Safely treats Google Safe Browsing as one signal in the background verdict pipeline. The Chrome extension never calls Google directly and never contains the Google Safe Browsing API key. Instead, the extension sends the page URL to a small local backend, the backend calls Google's v4 Lookup API, and the background service worker folds any confirmed matches into the existing risk scoring flow.

If Google Safe Browsing confirms a threat, Safely upgrades the page to `HIGH RISK`, raises the score, keeps a clear Safe Browsing reason in the assessment, and continues with the normal Gemini and voice-warning flow. If Safe Browsing is unavailable, the extension keeps scanning with its existing rule-based and Gemini logic.

Google's Safe Browsing API is intended for non-commercial use. If this project moves into commercial production, plan to evaluate Google Web Risk instead.

## Local Setup

Install dependencies:

```bash
npm install
```

Build the extension bundle:

```bash
npm run build
```

Build and run the Safe Browsing backend locally:

```bash
export GOOGLE_SAFE_BROWSING_API_KEY="your-google-safe-browsing-api-key"
npm run server:start
```

The backend listens on `http://127.0.0.1:8787` by default. The extension uses that URL via `SAFE_BROWSING_BACKEND_URL` in [`src/config.ts`](/home/harrison/Documents/Hackathon/Safely-E/src/config.ts).

Load the extension in Chrome:

```bash
chrome://extensions
```

Then enable Developer Mode, choose "Load unpacked", and select:

```bash
/home/harrison/Documents/Hackathon/Safely-E
```

## Backend API

Endpoint:

```http
POST /api/safe-browsing/check
Content-Type: application/json
```

Example request:

```json
{
  "url": "https://example.com"
}
```

Example safe response:

```json
{
  "safe": true,
  "matches": [],
  "source": "google-safe-browsing"
}
```

Example unsafe response:

```json
{
  "safe": false,
  "matches": [
    {
      "threatType": "SOCIAL_ENGINEERING",
      "platformType": "ANY_PLATFORM",
      "threatEntryType": "URL"
    }
  ],
  "source": "google-safe-browsing"
}
```

## Tests

Run the focused Safe Browsing tests:

```bash
npm test
```

## End-to-End Flow

1. The content script extracts page signals and sends the rule-based assessment to the background service worker.
2. The background worker calls the local Safely backend through [`src/background/safebrowsing.ts`](/home/harrison/Documents/Hackathon/Safely-E/src/background/safebrowsing.ts).
3. The backend validates the URL, calls Google Safe Browsing with the server-only API key, and returns structured matches.
4. The background worker stores the Safe Browsing result on the assessment, upgrades confirmed malicious URLs to `HIGH RISK`, and preserves a clear reason.
5. Gemini and the voice warning continue to run as before, with Safe Browsing treated as one strong signal instead of the entire verdict.
