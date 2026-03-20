/**
 * Browser Platform Backend
 * Manages user accounts, sessions, and Chromium browser streaming
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const WS_PING_INTERVAL = 30000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://127.0.0.1:3000', 
  credentials: true 
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Data Stores
const users = new Map();
const activeSessions = new Map();
const browserInstances = new Map();

// Initialize default users
async function initializeUsers() {
  const defaultUsers = [
    { username: 'admin', password: 'admin123' },
    { username: 'user1', password: 'password1' },
    { username: 'user2', password: 'password2' }
  ];

  for (const user of defaultUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    users.set(user.username, {
      id: uuidv4(),
      username: user.username,
      password: hashedPassword,
      createdAt: new Date()
    });
  }
  console.log(`[Auth] Initialized ${users.size} default users`);
}

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.token = token;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const validateSession = (req, res, next) => {
  const session = activeSessions.get(req.userId);
  if (!session) return res.status(401).json({ error: 'Session expired or logged out' });
  if (session.token !== req.token) return res.status(401).json({ error: 'Session invalidated by new login' });
  session.lastActivity = Date.now();
  next();
};

// Browser Management
async function launchBrowserForUser(userId) {
  console.log(`[Browser] Launching Chromium for user: ${userId}`);
  
  try {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto('https://www.google.com', { waitUntil: 'networkidle' });

    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Page.enable');
    await cdpSession.send('Runtime.enable');

    browserInstances.set(userId, {
      browser, context, page, cdpSession,
      wsClients: new Set(),
      isStreaming: false,
      streamInterval: null
    });

    console.log(`[Browser] Chromium launched for user: ${userId}`);
    return browserInstances.get(userId);
  } catch (error) {
    console.error(`[Browser] Failed to launch Chromium:`, error);
    throw error;
  }
}

async function getOrCreateBrowser(userId) {
  let instance = browserInstances.get(userId);
  if (!instance) instance = await launchBrowserForUser(userId);
  return instance;
}

// Streaming
async function startStreaming(userId, ws) {
  const instance = browserInstances.get(userId);
  if (!instance) return;

  instance.wsClients.add(ws);
  instance.isStreaming = true;

  const fps = 30;
  const interval = 1000 / fps;

  instance.streamInterval = setInterval(async () => {
    if (!instance.isStreaming || ws.readyState !== WebSocket.OPEN) return;
    try {
      const { data } = await instance.cdpSession.send('Page.captureScreenshot', { 
        format: 'jpeg', 
        quality: 80 
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'screenshot', data: data, timestamp: Date.now() }));
      }
    } catch (error) {}
  }, interval);
}

function stopStreaming(userId, ws) {
  const instance = browserInstances.get(userId);
  if (instance) {
    instance.wsClients.delete(ws);
    if (instance.wsClients.size === 0) {
      instance.isStreaming = false;
      if (instance.streamInterval) {
        clearInterval(instance.streamInterval);
        instance.streamInterval = null;
      }
    }
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    activeUsers: activeSessions.size, 
    activeBrowsers: browserInstances.size 
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = users.get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

  if (activeSessions.get(user.id)) {
    return res.status(409).json({ 
      error: 'Account in use', 
      message: 'This account is already logged in on another device' 
    });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
  
  activeSessions.set(user.id, { 
    token, 
    username: user.username, 
    loginTime: Date.now(), 
    lastActivity: Date.now() 
  });

  try {
    await getOrCreateBrowser(user.id);
  } catch (error) {
    activeSessions.delete(user.id);
    return res.status(500).json({ error: 'Failed to initialize browser' });
  }

  console.log(`[Auth] User logged in: ${username}`);
  res.json({ success: true, token, username: user.username, redirectUrl: '/browser' });
});

app.post('/api/auth/logout', authenticateToken, validateSession, async (req, res) => {
  const userId = req.userId;
  activeSessions.delete(userId);

  const instance = browserInstances.get(userId);
  if (instance) {
    instance.wsClients.forEach(ws => { 
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'User logged out'); 
    });
    instance.wsClients.clear();
    instance.isStreaming = false;
    if (instance.streamInterval) { 
      clearInterval(instance.streamInterval); 
      instance.streamInterval = null; 
    }
  }

  console.log(`[Auth] User logged out: ${req.username}`);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/verify', authenticateToken, validateSession, (req, res) => {
  res.json({ valid: true, username: req.username, userId: req.userId });
});

app.get('/api/browser/connect', authenticateToken, validateSession, async (req, res) => {
  try {
    const instance = await getOrCreateBrowser(req.userId);
    res.json({ success: true, wsUrl: '/ws/browser', pageUrl: instance.page.url() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to browser' });
  }
});

app.post('/api/browser/navigate', authenticateToken, validateSession, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const instance = browserInstances.get(req.userId);
  if (!instance) return res.status(404).json({ error: 'Browser not found' });

  try {
    await instance.page.goto(url, { waitUntil: 'networkidle' });
    res.json({ success: true, url: instance.page.url() });
  } catch (error) {
    res.status(500).json({ error: 'Navigation failed' });
  }
});

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws/browser' });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) { ws.close(1008, 'Token required'); return; }

  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
    const session = activeSessions.get(userId);
    if (!session || session.token !== token) { ws.close(1008, 'Invalid session'); return; }
  } catch (error) { ws.close(1008, 'Invalid token'); return; }

  let instance;
  try { instance = await getOrCreateBrowser(userId); } 
  catch (error) { ws.close(1011, 'Browser initialization failed'); return; }

  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Browser session connected', 
    url: instance.page.url() 
  }));
  startStreaming(userId, ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      const instance = browserInstances.get(userId);
      if (!instance) return;

      switch (message.type) {
        case 'mousemove': 
          await instance.page.mouse.move(message.x, message.y); 
          break;
        case 'mousedown': 
          await instance.page.mouse.down({ button: message.button || 'left' }); 
          break;
        case 'mouseup': 
          await instance.page.mouse.up({ button: message.button || 'left' }); 
          break;
        case 'click': 
          await instance.page.mouse.click(message.x, message.y, { button: message.button || 'left' }); 
          break;
        case 'dblclick': 
          await instance.page.mouse.dblclick(message.x, message.y); 
          break;
        case 'keydown': 
          await instance.page.keyboard.down(message.key); 
          break;
        case 'keyup': 
          await instance.page.keyboard.up(message.key); 
          break;
        case 'scroll': 
          await instance.page.mouse.wheel(message.deltaX || 0, message.deltaY || 0); 
          break;
        case 'navigate': 
          await instance.page.goto(message.url, { waitUntil: 'networkidle' });
          ws.send(JSON.stringify({ type: 'navigated', url: instance.page.url() }));
          break;
        case 'goback': 
          await instance.page.goBack(); 
          ws.send(JSON.stringify({ type: 'navigated', url: instance.page.url() })); 
          break;
        case 'goforward': 
          await instance.page.goForward(); 
          ws.send(JSON.stringify({ type: 'navigated', url: instance.page.url() })); 
          break;
        case 'reload': 
          await instance.page.reload(); 
          ws.send(JSON.stringify({ type: 'navigated', url: instance.page.url() })); 
          break;
      }
    } catch (error) {}
  });

  ws.on('close', () => stopStreaming(userId, ws));
  ws.on('error', (error) => console.error(`[WebSocket] Error:`, error));
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => { 
    if (ws.isAlive === false) return ws.terminate(); 
    ws.isAlive = false; 
    ws.ping(); 
  });
}, WS_PING_INTERVAL);

wss.on('close', () => clearInterval(pingInterval));

// Cleanup inactive sessions
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of activeSessions.entries()) {
    if (now - session.lastActivity > 24 * 60 * 60 * 1000) {
      activeSessions.delete(userId);
      const instance = browserInstances.get(userId);
      if (instance) {
        instance.wsClients.forEach(ws => { 
          if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'Session timeout'); 
        });
      }
    }
  }
}, 60 * 60 * 1000);

// Graceful shutdown
async function shutdown() {
  console.log('[Server] Shutting down gracefully');
  for (const userId of browserInstances.keys()) {
    const instance = browserInstances.get(userId);
    if (instance) {
      instance.wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.close(); });
      try { await instance.browser.close(); } catch (e) {}
    }
  }
  server.close(() => { console.log('[Server] Server closed'); process.exit(0); });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start Server
async function startServer() {
  await initializeUsers();
  server.listen(PORT, () => {
    console.log(`
========================================
  Browser Platform Backend
========================================
  Server running on port: ${PORT}
  WebSocket path: /ws/browser
========================================
    `);
  });
}

startServer().catch(console.error);
