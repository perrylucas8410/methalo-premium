// backend/webrtc/webrtc-session.js
const { RTCPeerConnection, RTCVideoSource } = require("wrtc");
const EventEmitter = require("events");
const { mapInputToEngine } = require("./input-mapper");
const logger = require("../utils/logger");

class WebRTCSession extends EventEmitter {
  constructor(sessionId, engine) {
    super();
    this.sessionId = sessionId;
    this.engine = engine;

    this.pc = null;
    this.videoSource = null;
    this.videoTrack = null;
    this.dataChannel = null;
    this.frameInterval = null;

    this.init();
  }

  init() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    this.videoSource = new RTCVideoSource();
    this.videoTrack = this.videoSource.createTrack();
    this.pc.addTrack(this.videoTrack);

    this.dataChannel = this.pc.createDataChannel("input");
    this.dataChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        mapInputToEngine(this.engine, msg);
      } catch (err) {
        logger.error("Bad input message:", err);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit("ice-candidate", event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      logger.info("WebRTC state:", this.pc.connectionState);
      if (this.pc.connectionState === "connected") {
        this.startFrameLoop();
      } else if (
        this.pc.connectionState === "disconnected" ||
        this.pc.connectionState === "failed" ||
        this.pc.connectionState === "closed"
      ) {
        this.stopFrameLoop();
      }
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer({
      offerToReceiveVideo: true
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async setAnswer(answer) {
    await this.pc.setRemoteDescription(answer);
  }

  async addIceCandidate(candidate) {
    await this.pc.addIceCandidate(candidate);
  }

  async startFrameLoop() {
    if (this.frameInterval) return;

    this.frameInterval = setInterval(async () => {
      try {
        const frame = await this.engine.captureFrame();
        if (!frame) return;

        // frame = { width, height, data: Uint8Array RGBA }
        this.videoSource.onFrame({
          width: frame.width,
          height: frame.height,
          data: frame.data
        });
      } catch (err) {
        logger.error("Frame loop error:", err);
      }
    }, 1000 / 30); // start with ~30 FPS
  }

  stopFrameLoop() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  close() {
    this.stopFrameLoop();
    if (this.pc) this.pc.close();
  }
}

module.exports = { WebRTCSession };