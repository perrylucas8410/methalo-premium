const express = require("express");
const router = express.Router();

router.get("/tabs", async (req, res) => {
  const token = req.headers.authorization;
  const map = req.app.locals.sessionsByToken;
  const sessionManager = req.app.locals.sessionManager;

  if (!token || !map[token]) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionId = map[token];
  const session = await sessionManager.createSession(sessionId);

  res.json(session.tabs.toJSON());
});

router.post("/tab/create", async (req, res) => {
  const token = req.headers.authorization;
  const map = req.app.locals.sessionsByToken;
  const sessionManager = req.app.locals.sessionManager;

  if (!token || !map[token]) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionId = map[token];
  const session = await sessionManager.createSession(sessionId);

  const tabId = session.tabs.createTab();
  res.json({ tabId });
});

router.post("/tab/switch", async (req, res) => {
  const token = req.headers.authorization;
  const map = req.app.locals.sessionsByToken;
  const sessionManager = req.app.locals.sessionManager;

  if (!token || !map[token]) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { tabId } = req.body;
  const sessionId = map[token];
  const session = await sessionManager.createSession(sessionId);

  session.tabs.switchTab(tabId);
  res.json({ ok: true });
});

router.post("/tab/close", async (req, res) => {
  const token = req.headers.authorization;
  const map = req.app.locals.sessionsByToken;
  const sessionManager = req.app.locals.sessionManager;

  if (!token || !map[token]) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { tabId } = req.body;
  const sessionId = map[token];
  const session = await sessionManager.createSession(sessionId);

  session.tabs.closeTab(tabId);
  res.json({ ok: true });
});

module.exports = router;