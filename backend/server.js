require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const sessionRoutes = require("./routes/session");
const tabsRoutes = require("./routes/tabs");
const webrtcRoutes = require("./routes/webrtc");

const { SessionManager } = require("./session-manager");
const { WebRTCManager } = require("./webrtc/signaling");

const app = express();
app.use(cors());
app.use(express.json());

app.locals.sessionsByToken = {};
app.locals.sessionManager = new SessionManager();
app.locals.webrtcManager = new WebRTCManager(app.locals.sessionManager);

// API
app.use("/api/auth", authRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/session", tabsRoutes);
app.use("/api/webrtc", webrtcRoutes);

// Static frontend
const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "public");
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/browser", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "browser.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Methalo backend listening on", PORT);
});