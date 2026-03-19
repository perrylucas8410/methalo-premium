// backend/engines/webkit/launch.js
const { webkit } = require("@playwright/test");
const { capturePageFrame } = require("./frame-capture");
const logger = require("../../utils/logger");

class WebKitEngine {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    logger.info("Launching WebKit for session", this.sessionId);

    this.browser = await webkit.launch({
      headless: true
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    this.page = await this.context.newPage();

    // Default start page
    await this.page.goto("https://www.google.com", {
      waitUntil: "networkidle"
    });

    logger.info("WebKit ready for session", this.sessionId);
  }

  async captureFrame() {
    if (!this.page) return null;
    try {
      return await capturePageFrame(this.page);
    } catch (err) {
      logger.error("captureFrame error:", err);
      return null;
    }
  }

  // INPUT MAPPING
  async mouseMove(x, y) {
    if (!this.page) return;
    await this.page.mouse.move(x, y);
  }

  async mouseDown(x, y, button = 0) {
    if (!this.page) return;
    const btn = button === 2 ? "right" : button === 1 ? "middle" : "left";
    await this.page.mouse.move(x, y);
    await this.page.mouse.down({ button: btn });
  }

  async mouseUp(x, y, button = 0) {
    if (!this.page) return;
    const btn = button === 2 ? "right" : button === 1 ? "middle" : "left";
    await this.page.mouse.move(x, y);
    await this.page.mouse.up({ button: btn });
  }

  async mouseWheel(deltaX, deltaY) {
    if (!this.page) return;
    await this.page.mouse.wheel(deltaX, deltaY);
  }

  async keyDown(key) {
    if (!this.page) return;
    await this.page.keyboard.down(key);
  }

  async keyUp(key) {
    if (!this.page) return;
    await this.page.keyboard.up(key);
  }

  async navigate(url) {
    if (!this.page) return;
    await this.page.goto(url, { waitUntil: "networkidle" });
  }

  async close() {
    try {
      if (this.browser) await this.browser.close();
    } catch (e) {
      logger.error("Error closing WebKit:", e);
    }
  }
}

module.exports = { WebKitEngine };