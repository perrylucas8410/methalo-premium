const { createWebKitSession } = require("../engines/webkit/session");
const { TabManager } = require("./tabs");

class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { engine, tabs, webrtc }
  }

  async createSession(sessionId) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);

    const engine = await createWebKitSession(sessionId);
    const tabs = new TabManager();

    // create initial tab
    tabs.createTab();

    const session = { engine, tabs, webrtc: null };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  attachWebRTC(sessionId, webrtcSession) {
    const s = this.getSession(sessionId);
    if (!s) return;
    s.webrtc = webrtcSession;
  }
}

module.exports = { SessionManager };