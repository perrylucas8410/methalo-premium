const express = require("express");
const router = express.Router();

router.post("/offer", async (req, res) => {
  const { sessionId } = req.body;
  const webrtcManager = req.app.locals.webrtcManager;

  const webrtc = await webrtcManager.getOrCreate(sessionId);
  const offer = await webrtc.createOffer();

  res.json({ offer });
});

router.post("/answer", async (req, res) => {
  const { sessionId, answer } = req.body;
  const webrtcManager = req.app.locals.webrtcManager;

  const webrtc = await webrtcManager.getOrCreate(sessionId);
  await webrtc.setAnswer(answer);

  res.json({ ok: true });
});

router.post("/candidate", async (req, res) => {
  const { sessionId, candidate } = req.body;
  const webrtcManager = req.app.locals.webrtcManager;

  const webrtc = await webrtcManager.getOrCreate(sessionId);
  await webrtc.addIceCandidate(candidate);

  res.json({ ok: true });
});

module.exports = router;