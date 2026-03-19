const { WebRTCSession } = require("./webrtc-session");
const logger = require("../utils/logger");

class WebRTCManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.webrtcSessions = new Map(); // sessionId -> WebRTCSession
  }

  async getOrCreate(sessionId) {
    if (this.webrtcSessions.has(sessionId)) {
      return this.webrtcSessions.get(sessionId);
    }

    const session = await this.sessionManager.createSession(sessionId);
    const engine = session.engine;

    const webrtc = new WebRTCSession(sessionId, engine);
    this.webrtcSessions.set(sessionId, webrtc);
    this.sessionManager.attachWebRTC(sessionId, webrtc);

    webrtc.on("ice-candidate", (candidate) => {
      // For now, we do trickle ICE via HTTP
      logger.info("ICE candidate generated for", sessionId);
      // You can store or push to client if you want more advanced signaling
    });

    return webrtc;
  }
}

module.exports = { WebRTCManager };