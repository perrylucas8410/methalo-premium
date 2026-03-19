const express = require("express");
const router = express.Router();

router.get("/attach", (req, res) => {
  const token = req.headers.authorization;
  const map = req.app.locals.sessionsByToken;

  if (!token || !map[token]) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionId = map[token];

  res.json({
    sessionId
  });
});

module.exports = router;