// Playwright runs this acceptance in Node, not in a Client Component runtime.
// Resolve Next.js' server-only marker to a no-op strictly inside the E2E harness.
module.exports = {};
