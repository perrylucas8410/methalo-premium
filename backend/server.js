/**
 * Browser Platform Backend - Modified with Shared Sessions & Tab Support
 * Manages user accounts, shared browser sessions, and heartbeat detection
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

// Load configuration from config.js
const config = require('./config');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const WS_PING_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = config.heartbeatTimeout || 5000;
const NUM_BROWSER_SESSIONS = config.numBrowserSessions || 5;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));

// CORS - Allow multiple domains
const allowedOrigins = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'https://premium.methalo.online',
  'http://premium.methalo.online'
];

app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.FRONTEND_URL === origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Data Stores
const users = new Map();
const activeSessions = new Map(); // userId -> session data
const sessionAssignments = new Map(); // userId -> browserSessionId
const browserSessions = new Map(); // sessionId -> browser instance
const sessionUsers = new Map(); // sessionId -> Set of userIds
const heartbeatTimers = new Map(); // userId -> timeout

// Initialize users from config
async function initializeUsers() {
  const userList = config.users || [];

  for (const user of userList) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    users.set(user.username, {
      id: uuidv4(),
      username: user.username,
      password: hashedPassword,
      isAdmin: user.isAdmin || false,
      createdAt: new Date()
    });
  }
  console.log(`[Auth] Initialized ${users.size} users from config`);
}

// Initialize shared browser sessions
async function initializeBrowserSessions() {
  console.log(`[Browser] Initializing ${NUM_BROWSER_SESSIONS} shared browser sessions...`);
  
  for (let i = 0; i < NUM_BROWSER_SESSIONS; i++) {
    const sessionId = `browser-session-${i}`;
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

      browserSessions.set(sessionId, {
        browser,
        context,
        page,
        cdpSession,
        wsClients: new Map(), // userId -> ws
        isStreaming: false,
        streamInterval: null,
        tabs: [{ id: 'tab-1', url: 'https://www.google.com', title: 'Google' }],
        activeTabId: 'tab-1'
      });

      sessionUsers.set(sessionId, new Set());
      console.log(`[Browser] Session ${sessionId} initialized`);
    } catch (error) {
      console.error(`[Browser] Failed to initialize session ${sessionId}:`, error);
    }
  }
  console.log(`[Browser] All ${NUM_BROWSER_SESSIONS} sessions ready`);
}

// Get available browser session (least loaded)
function getAvailableBrowserSession() {
  let minUsers = Infinity;
  let availableSession = null;
  
  for (const [sessionId, users] of sessionUsers.entries()) {
    if (users.size < minUsers) {
      minUsers = users.size;
      availableSession = sessionId;
    }
  }
  
  return availableSession;
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

// Admin Middleware
const requireAdmin = (req, res, next) => {
  const user = Array.from(users.values()).find(u => u.id === req.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.user = user;
  next();
};

// Heartbeat management
function startHeartbeatTimer(userId) {
  // Clear existing timer
  if (heartbeatTimers.has(userId)) {
    clearTimeout(heartbeatTimers.get(userId));
  }
  
  // Set new timer
  const timer = setTimeout(() => {
    console.log(`[Heartbeat] User ${userId} timed out after ${HEARTBEAT_TIMEOUT}ms`);
    releaseUserSession(userId);
  }, HEARTBEAT_TIMEOUT);
  
  heartbeatTimers.set(userId, timer);
}

function clearHeartbeatTimer(userId) {
  if (heartbeatTimers.has(userId)) {
    clearTimeout(heartbeatTimers.get(userId));
    heartbeatTimers.delete(userId);
  }
}

function releaseUserSession(userId) {
  console.log(`[Session] Releasing session for user: ${userId}`);
  
  // Remove from active sessions
  activeSessions.delete(userId);
  
  // Remove from browser session assignment
  const sessionId = sessionAssignments.get(userId);
  if (sessionId) {
    const users = sessionUsers.get(sessionId);
    if (users) {
      users.delete(userId);
    }
    
    // Close WebSocket connections for this user
    const browserSession = browserSessions.get(sessionId);
    if (browserSession && browserSession.wsClients.has(userId)) {
      const ws = browserSession.wsClients.get(userId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Heartbeat timeout');
      }
      browserSession.wsClients.delete(userId);
    }
    
    sessionAssignments.delete(userId);
  }
  
  // Clear heartbeat timer
  clearHeartbeatTimer(userId);
  
  console.log(`[Session] User ${userId} session released`);
}

// Streaming
async function startStreaming(sessionId, userId, ws) {
  const instance = browserSessions.get(sessionId);
  if (!instance) return;

  instance.wsClients.set(userId, ws);
  instance.isStreaming = true;

  const fps = 30;
  const interval = 1000 / fps;

  if (!instance.streamInterval) {
    instance.streamInterval = setInterval(async () => {
      if (!instance.isStreaming) return;
      try {
        const { data } = await instance.cdpSession.send('Page.captureScreenshot', { 
          format: 'jpeg', 
          quality: 80 
        });
        
        // Broadcast to all connected users of this session
        for (const [uid, clientWs] of instance.wsClients.entries()) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ 
              type: 'screenshot', 
              data: data, 
              timestamp: Date.now(),
              tabs: instance.tabs,
              activeTabId: instance.activeTabId
            }));
          }
        }
      } catch (error) {}
    }, interval);
  }
}

function stopStreaming(sessionId, userId) {
  const instance = browserSessions.get(sessionId);
  if (instance) {
    instance.wsClients.delete(userId);
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
    activeBrowsers: browserSessions.size,
    sessionAssignments: Array.from(sessionAssignments.entries()).map(([userId, sessionId]) => ({
      userId: userId.substring(0, 8) + '...',
      sessionId
    }))
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = users.get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

  // Check if user already has an active session
  if (activeSessions.has(user.id)) {
    // Clear the old session and allow re-login
    releaseUserSession(user.id);
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
  
  // Admin users don't get browser sessions - they go to admin panel
  if (user.isAdmin) {
    activeSessions.set(user.id, { 
      token, 
      username: user.username, 
      isAdmin: true,
      loginTime: Date.now(), 
      lastActivity: Date.now()
    });
    
    console.log(`[Auth] Admin logged in: ${username}`);
    return res.json({ 
      success: true, 
      token, 
      username: user.username, 
      isAdmin: true,
      redirectUrl: '/admin'
    });
  }
  
  // Assign regular user to a browser session
  const browserSessionId = getAvailableBrowserSession();
  if (!browserSessionId) {
    return res.status(503).json({ error: 'No browser sessions available' });
  }
  
  sessionAssignments.set(user.id, browserSessionId);
  sessionUsers.get(browserSessionId).add(user.id);
  
  activeSessions.set(user.id, { 
    token, 
    username: user.username, 
    isAdmin: false,
    loginTime: Date.now(), 
    lastActivity: Date.now(),
    browserSessionId
  });
  
  // Start heartbeat timer
  startHeartbeatTimer(user.id);

  const browserSession = browserSessions.get(browserSessionId);

  console.log(`[Auth] User logged in: ${username} -> ${browserSessionId}`);
  res.json({ 
    success: true, 
    token, 
    username: user.username, 
    isAdmin: false,
    redirectUrl: '/browser',
    browserSessionId,
    tabs: browserSession.tabs,
    activeTabId: browserSession.activeTabId
  });
});

app.post('/api/auth/logout', authenticateToken, validateSession, async (req, res) => {
  const userId = req.userId;
  releaseUserSession(userId);
  console.log(`[Auth] User logged out: ${req.username}`);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/verify', authenticateToken, validateSession, (req, res) => {
  const session = activeSessions.get(req.userId);
  const user = Array.from(users.values()).find(u => u.id === req.userId);
  const isAdmin = user ? user.isAdmin : false;
  
  // Admin users don't have browser sessions
  if (isAdmin) {
    return res.json({ 
      valid: true, 
      username: req.username, 
      userId: req.userId,
      isAdmin: true
    });
  }
  
  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  res.json({ 
    valid: true, 
    username: req.username, 
    userId: req.userId,
    isAdmin: false,
    browserSessionId: sessionId,
    tabs: browserSession ? browserSession.tabs : [],
    activeTabId: browserSession ? browserSession.activeTabId : null
  });
});

// Heartbeat endpoint
app.post('/api/heartbeat', authenticateToken, (req, res) => {
  const userId = req.userId;
  
  // Check if session exists
  const session = activeSessions.get(userId);
  if (!session) {
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Update last activity
  session.lastActivity = Date.now();
  
  // Reset heartbeat timer
  startHeartbeatTimer(userId);
  
  res.json({ success: true, timestamp: Date.now() });
});

app.get('/api/browser/connect', authenticateToken, validateSession, async (req, res) => {
  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) {
    return res.status(500).json({ error: 'Browser session not found' });
  }
  
  res.json({ 
    success: true, 
    wsUrl: '/ws/browser', 
    pageUrl: browserSession.page.url(),
    browserSessionId: sessionId,
    tabs: browserSession.tabs,
    activeTabId: browserSession.activeTabId
  });
});

app.post('/api/browser/navigate', authenticateToken, validateSession, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) return res.status(404).json({ error: 'Browser not found' });

  try {
    await browserSession.page.goto(url, { waitUntil: 'networkidle' });
    
    // Update tab info
    const activeTab = browserSession.tabs.find(t => t.id === browserSession.activeTabId);
    if (activeTab) {
      activeTab.url = browserSession.page.url();
      activeTab.title = await browserSession.page.title() || 'New Tab';
    }
    
    res.json({ 
      success: true, 
      url: browserSession.page.url(),
      tabs: browserSession.tabs,
      activeTabId: browserSession.activeTabId
    });
  } catch (error) {
    res.status(500).json({ error: 'Navigation failed' });
  }
});

// Tab management endpoints
app.post('/api/browser/tab', authenticateToken, validateSession, async (req, res) => {
  const { url = 'https://www.google.com' } = req.body;
  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) return res.status(404).json({ error: 'Browser not found' });
  
  try {
    const newTabId = `tab-${Date.now()}`;
    
    // Navigate current page to new URL (simulating new tab in shared session)
    await browserSession.page.goto(url, { waitUntil: 'networkidle' });
    
    const newTab = {
      id: newTabId,
      url: browserSession.page.url(),
      title: await browserSession.page.title() || 'New Tab'
    };
    
    browserSession.tabs.push(newTab);
    browserSession.activeTabId = newTabId;
    
    res.json({ 
      success: true, 
      tab: newTab,
      tabs: browserSession.tabs,
      activeTabId: browserSession.activeTabId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create tab' });
  }
});

app.post('/api/browser/tab/switch', authenticateToken, validateSession, async (req, res) => {
  const { tabId } = req.body;
  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) return res.status(404).json({ error: 'Browser not found' });
  
  const tab = browserSession.tabs.find(t => t.id === tabId);
  if (!tab) return res.status(404).json({ error: 'Tab not found' });
  
  try {
    await browserSession.page.goto(tab.url, { waitUntil: 'networkidle' });
    browserSession.activeTabId = tabId;
    
    res.json({ 
      success: true, 
      tabs: browserSession.tabs,
      activeTabId: browserSession.activeTabId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to switch tab' });
  }
});

app.delete('/api/browser/tab/:tabId', authenticateToken, validateSession, async (req, res) => {
  const { tabId } = req.params;
  const sessionId = sessionAssignments.get(req.userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) return res.status(404).json({ error: 'Browser not found' });
  
  const tabIndex = browserSession.tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return res.status(404).json({ error: 'Tab not found' });
  
  // Remove tab
  browserSession.tabs.splice(tabIndex, 1);
  
  // If no tabs left, create a new one
  if (browserSession.tabs.length === 0) {
    const newTabId = `tab-${Date.now()}`;
    await browserSession.page.goto('https://www.google.com', { waitUntil: 'networkidle' });
    browserSession.tabs.push({
      id: newTabId,
      url: browserSession.page.url(),
      title: 'Google'
    });
    browserSession.activeTabId = newTabId;
  } else if (browserSession.activeTabId === tabId) {
    // Switch to another tab
    browserSession.activeTabId = browserSession.tabs[0].id;
    await browserSession.page.goto(browserSession.tabs[0].url, { waitUntil: 'networkidle' });
  }
  
  res.json({ 
    success: true, 
    tabs: browserSession.tabs,
    activeTabId: browserSession.activeTabId
  });
});

// ==================== ADMIN API ENDPOINTS ====================

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const userList = Array.from(users.values()).map(user => ({
    username: user.username,
    isAdmin: user.isAdmin,
    isActive: activeSessions.has(user.id),
    sessionId: sessionAssignments.get(user.id) || null
  }));
  res.json(userList);
});

// Add new user (admin only)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, isAdmin: isAdminUser } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (users.has(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  users.set(username, {
    id: uuidv4(),
    username,
    password: hashedPassword,
    isAdmin: isAdminUser || false,
    createdAt: new Date()
  });
  
  console.log(`[Admin] User created: ${username} (admin: ${isAdminUser || false})`);
  res.json({ success: true, message: 'User created successfully' });
});

// Update user password (admin only)
app.put('/api/admin/users/:username', authenticateToken, requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { password } = req.body;
  
  const user = users.get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (password) {
    user.password = await bcrypt.hash(password, 10);
    console.log(`[Admin] Password updated for: ${username}`);
  }
  
  res.json({ success: true, message: 'User updated successfully' });
});

// Delete user (admin only)
app.delete('/api/admin/users/:username', authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  
  const user = users.get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Don't allow deleting yourself
  if (user.id === req.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  // Release user session if active
  if (activeSessions.has(user.id)) {
    releaseUserSession(user.id);
  }
  
  users.delete(username);
  console.log(`[Admin] User deleted: ${username}`);
  res.json({ success: true, message: 'User deleted successfully' });
});

// Get all browser sessions (admin only)
app.get('/api/admin/sessions', authenticateToken, requireAdmin, (req, res) => {
  const sessionList = Array.from(browserSessions.entries()).map(([id, session]) => ({
    id,
    active: session.browser.isConnected(),
    userCount: session.wsClients.size,
    currentUrl: session.page ? session.page.url() : null,
    tabs: session.tabs || []
  }));
  res.json(sessionList);
});

// Toggle session on/off (admin only)
app.post('/api/admin/sessions/:sessionId/toggle', authenticateToken, requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const session = browserSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Close all connected users
  session.wsClients.forEach((ws, userId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Session stopped by admin');
    }
    // Release user session
    releaseUserSession(userId);
  });
  session.wsClients.clear();
  
  // Stop streaming
  session.isStreaming = false;
  if (session.streamInterval) {
    clearInterval(session.streamInterval);
    session.streamInterval = null;
  }
  
  console.log(`[Admin] Session ${sessionId} stopped`);
  res.json({ success: true, message: 'Session stopped' });
});

// Restart session (admin only)
app.post('/api/admin/sessions/:sessionId/restart', authenticateToken, requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const session = browserSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    // Close all connected users
    session.wsClients.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Session restarting');
      }
      releaseUserSession(userId);
    });
    session.wsClients.clear();
    
    // Stop streaming
    session.isStreaming = false;
    if (session.streamInterval) {
      clearInterval(session.streamInterval);
      session.streamInterval = null;
    }
    
    // Close old browser
    try { await session.browser.close(); } catch (e) {}
    
    // Launch new browser
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

    // Update session
    session.browser = browser;
    session.context = context;
    session.page = page;
    session.cdpSession = cdpSession;
    session.tabs = [{ id: 'tab-1', url: 'https://www.google.com', title: 'Google' }];
    session.activeTabId = 'tab-1';

    console.log(`[Admin] Session ${sessionId} restarted`);
    res.json({ success: true, message: 'Session restarted' });
  } catch (error) {
    console.error(`[Admin] Failed to restart session ${sessionId}:`, error);
    res.status(500).json({ error: 'Failed to restart session' });
  }
});

// Get system stats (admin only)
app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    totalUsers: users.size,
    activeUsers: activeSessions.size,
    totalSessions: browserSessions.size,
    activeSessions: Array.from(browserSessions.values()).filter(s => s.browser.isConnected()).length
  });
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

  const sessionId = sessionAssignments.get(userId);
  const browserSession = browserSessions.get(sessionId);
  
  if (!browserSession) { ws.close(1011, 'Browser session not found'); return; }

  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Browser session connected', 
    url: browserSession.page.url(),
    browserSessionId: sessionId,
    tabs: browserSession.tabs,
    activeTabId: browserSession.activeTabId
  }));
  
  startStreaming(sessionId, userId, ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      // Reset heartbeat on any activity
      startHeartbeatTimer(userId);
      
      if (!browserSession) return;

      switch (message.type) {
        case 'mousemove': 
          await browserSession.page.mouse.move(message.x, message.y); 
          break;
        case 'mousedown': 
          await browserSession.page.mouse.down({ button: message.button || 'left' }); 
          break;
        case 'mouseup': 
          await browserSession.page.mouse.up({ button: message.button || 'left' }); 
          break;
        case 'click': 
          await browserSession.page.mouse.click(message.x, message.y, { button: message.button || 'left' }); 
          break;
        case 'dblclick': 
          await browserSession.page.mouse.dblclick(message.x, message.y); 
          break;
        case 'keydown': 
          await browserSession.page.keyboard.down(message.key); 
          break;
        case 'keyup': 
          await browserSession.page.keyboard.up(message.key); 
          break;
        case 'scroll': 
          await browserSession.page.mouse.wheel(message.deltaX || 0, message.deltaY || 0); 
          break;
        case 'navigate': 
          await browserSession.page.goto(message.url, { waitUntil: 'networkidle' });
          // Update active tab
          const activeTab = browserSession.tabs.find(t => t.id === browserSession.activeTabId);
          if (activeTab) {
            activeTab.url = browserSession.page.url();
            activeTab.title = await browserSession.page.title() || 'New Tab';
          }
          ws.send(JSON.stringify({ 
            type: 'navigated', 
            url: browserSession.page.url(),
            tabs: browserSession.tabs,
            activeTabId: browserSession.activeTabId
          }));
          break;
        case 'goback': 
          await browserSession.page.goBack(); 
          ws.send(JSON.stringify({ 
            type: 'navigated', 
            url: browserSession.page.url(),
            tabs: browserSession.tabs,
            activeTabId: browserSession.activeTabId
          })); 
          break;
        case 'goforward': 
          await browserSession.page.goForward(); 
          ws.send(JSON.stringify({ 
            type: 'navigated', 
            url: browserSession.page.url(),
            tabs: browserSession.tabs,
            activeTabId: browserSession.activeTabId
          })); 
          break;
        case 'reload': 
          await browserSession.page.reload(); 
          ws.send(JSON.stringify({ 
            type: 'navigated', 
            url: browserSession.page.url(),
            tabs: browserSession.tabs,
            activeTabId: browserSession.activeTabId
          })); 
          break;
        case 'heartbeat':
          ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
          break;
      }
    } catch (error) {}
  });

  ws.on('close', () => {
    stopStreaming(sessionId, userId);
  });
  
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

// Graceful shutdown
async function shutdown() {
  console.log('[Server] Shutting down gracefully');
  
  // Clear all heartbeat timers
  for (const timer of heartbeatTimers.values()) {
    clearTimeout(timer);
  }
  
  for (const sessionId of browserSessions.keys()) {
    const instance = browserSessions.get(sessionId);
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
  await initializeBrowserSessions();
  server.listen(PORT, () => {
    console.log(`
========================================
  Browser Platform Backend
========================================
  Server running on port: ${PORT}
  WebSocket path: /ws/browser
  Shared Sessions: ${NUM_BROWSER_SESSIONS}
  Heartbeat Timeout: ${HEARTBEAT_TIMEOUT}ms
========================================
    `);
  });
}

startServer().catch(console.error);
