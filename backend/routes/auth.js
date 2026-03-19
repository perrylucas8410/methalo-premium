const express = require("express");
const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  // MVP: accept anything, return fake token + sessionId
  const sessionId = "sess_" + Math.random().toString(16).slice(2, 10);
  const token = "tok_" + Math.random().toString(16).slice(2, 18);

  // In real version, store mapping token -> sessionId
  req.app.locals.sessionsByToken[token] = sessionId;

  res.json({ token, sessionId });
});

router.post("/logout", (req, res) => {
  const token = req.headers.authorization;
  if (token && req.app.locals.sessionsByToken[token]) {
    delete req.app.locals.sessionsByToken[token];
  }
  res.json({ ok: true });
});

router.post("/heartbeat", (req, res) => {
  res.json({ ok: true });
});

module.exports = router;