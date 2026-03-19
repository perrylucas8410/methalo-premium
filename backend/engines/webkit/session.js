// backend/engines/webkit/session.js
const { WebKitEngine } = require("./launch");

async function createWebKitSession(sessionId) {
  const engine = new WebKitEngine(sessionId);
  await engine.init();
  return engine;
}

module.exports = { createWebKitSession };