"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const createServer_1 = require("./createServer");
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required.`);
    }
    return value;
}
function getPort() {
    const rawPort = process.env.PORT?.trim();
    if (!rawPort) {
        return 8787;
    }
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error('PORT must be a positive integer.');
    }
    return port;
}
const apiKey = requireEnv('GOOGLE_SAFE_BROWSING_API_KEY');
const port = getPort();
(0, createServer_1.createSafeBrowsingServer)({ apiKey, logger: console }).listen(port, () => {
    console.info(`[Safely] Safe Browsing backend listening on http://127.0.0.1:${port}`);
});
