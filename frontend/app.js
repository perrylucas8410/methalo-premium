const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://127.0.0.1:3001' : '';
const WS_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'ws://127.0.0.1:3001' : `wss://${window.location.host}`;

let currentUser = null;
let authToken = localStorage.getItem('token');
let wsConnection = null;
let isConnected = false;
let screenshot = null;
let currentUrl = '';

const app = document.getElementById('app');

async function verifyToken() {
  if (!authToken) return false;
  try {
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      currentUser = { username: data.username, userId: data.userId };
      return true;
    }
  } catch (error) { console.error('Token verification error:', error); }
  localStorage.removeItem('token');
  authToken = null;
  return false;
}

async function login(username, password) {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) return { 
      success: false, 
      error: data.error || 'Login failed', 
      message: data.message 
    };
    localStorage.setItem('token', data.token);
    authToken = data.token;
    currentUser = { username: data.username };
    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

async function logout() {
  try {
    if (authToken) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  } catch (error) { console.error('Logout error:', error); }
  disconnectWebSocket();
  localStorage.removeItem('token');
  authToken = null;
  currentUser = null;
  showLoginPage();
}

function connectWebSocket() {
  if (!authToken) return;
  const wsUrl = `${WS_URL}/ws/browser?token=${encodeURIComponent(authToken)}`;
  wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => { 
    isConnected = true; 
    updateConnectionStatus(); 
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'connected':
          if (message.url) { currentUrl = message.url; updateUrlBar(); }
          break;
        case 'screenshot':
          screenshot = `data:image/jpeg;base64,${message.data}`;
          updateScreenshot();
          break;
        case 'navigated':
          currentUrl = message.url;
          updateUrlBar();
          break;
      }
    } catch (error) { console.error('WebSocket message error:', error); }
  };
  
  wsConnection.onclose = () => { 
    isConnected = false; 
    updateConnectionStatus(); 
  };
  
  wsConnection.onerror = () => { 
    isConnected = false; 
    updateConnectionStatus(); 
  };
}

function disconnectWebSocket() {
  if (wsConnection) { 
    wsConnection.close(); 
    wsConnection = null; 
    isConnected = false; 
  }
}

function sendMessage(message) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(message));
  }
}

function showLoginPage() {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <div class="login-header">
          <h1>Browser Platform</h1>
          <p>Access your remote browser session</p>
        </div>
        <form class="login-form" id="loginForm">
          <div id="errorMessage"></div>
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" placeholder="Enter your username" autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter your password" autocomplete="current-password" />
          </div>
          <button type="submit" class="login-button" id="loginButton">Sign In</button>
        </form>
        <div class="demo-accounts">
          <p>Demo Accounts:</p>
          <p>admin / admin123</p>
          <p>user1 / password1</p>
          <p>user2 / password2</p>
        </div>
      </div>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorDiv = document.getElementById('errorMessage');
  const button = document.getElementById('loginButton');
  errorDiv.innerHTML = '';
  if (!username || !password) {
    errorDiv.innerHTML = '<div class="error-message">Please enter both username and password</div>';
    return;
  }
  button.disabled = true;
  button.textContent = 'Signing in...';
  const result = await login(username, password);
  if (result.success) showBrowserPage();
  else {
    const className = result.error.includes('in use') ? 'info-message' : 'error-message';
    errorDiv.innerHTML = `<div class="${className}">${result.error}</div>`;
    button.disabled = false;
    button.textContent = 'Sign In';
  }
}

function showBrowserPage() {
  app.innerHTML = `
    <div class="browser-container">
      <header class="browser-header">
        <div class="browser-header-left">
          <h2>Remote Browser</h2>
          <div class="connection-status">
            <span class="status-dot" id="statusDot"></span>
            <span id="statusText">Connecting...</span>
          </div>
        </div>
        <div class="user-info">
          <span class="username">${currentUser?.username || ''}</span>
          <button class="signout-button" id="signoutButton">Sign Out</button>
        </div>
      </header>
      <div class="browser-toolbar">
        <button class="nav-button" id="backButton" title="Go Back">←</button>
        <button class="nav-button" id="forwardButton" title="Go Forward">→</button>
        <button class="nav-button" id="reloadButton" title="Reload">↻</button>
        <form class="url-bar" id="urlForm">
          <input type="text" id="urlInput" placeholder="Enter URL..." />
          <button type="submit" class="go-button">Go</button>
        </form>
      </div>
      <div class="browser-viewport" id="viewport" tabindex="0">
        <div class="browser-screen" id="browserScreen">
          <div class="loading-screen" id="loadingScreen">
            <div class="spinner"></div>
            <p>Connecting to browser...</p>
          </div>
          <img id="screenImage" class="hidden" draggable="false" />
          <div class="browser-screen-overlay hidden" id="screenOverlay"></div>
          <div class="disconnected-overlay hidden" id="disconnectedOverlay">
            <p>Connection lost</p>
            <button class="reconnect-button" id="reconnectButton">Reconnect</button>
          </div>
        </div>
      </div>
    </div>`;
  
  document.getElementById('signoutButton').addEventListener('click', logout);
  document.getElementById('backButton').addEventListener('click', () => sendMessage({ type: 'goback' }));
  document.getElementById('forwardButton').addEventListener('click', () => sendMessage({ type: 'goforward' }));
  document.getElementById('reloadButton').addEventListener('click', () => sendMessage({ type: 'reload' }));
  document.getElementById('urlForm').addEventListener('submit', handleNavigate);
  document.getElementById('reconnectButton').addEventListener('click', connectWebSocket);
  
  const overlay = document.getElementById('screenOverlay');
  const viewport = document.getElementById('viewport');
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mousedown', handleMouseDown);
  overlay.addEventListener('mouseup', handleMouseUp);
  overlay.addEventListener('click', handleClick);
  overlay.addEventListener('dblclick', handleDoubleClick);
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  overlay.addEventListener('wheel', handleWheel);
  viewport.addEventListener('keydown', handleKeyDown);
  viewport.addEventListener('keyup', handleKeyUp);
  connectWebSocket();
}

function handleNavigate(e) {
  e.preventDefault();
  const urlInput = document.getElementById('urlInput');
  let url = urlInput.value.trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  sendMessage({ type: 'navigate', url });
}

function getScaleFactor() {
  const screen = document.getElementById('browserScreen');
  if (!screen) return { x: 1, y: 1 };
  const rect = screen.getBoundingClientRect();
  return { x: 1920 / rect.width, y: 1080 / rect.height };
}

function handleMouseMove(e) {
  if (!isConnected) return;
  const screen = document.getElementById('browserScreen');
  const rect = screen.getBoundingClientRect();
  const scale = getScaleFactor();
  sendMessage({ 
    type: 'mousemove', 
    x: (e.clientX - rect.left) * scale.x, 
    y: (e.clientY - rect.top) * scale.y 
  });
}

function handleMouseDown(e) {
  if (!isConnected) return;
  const screen = document.getElementById('browserScreen');
  const rect = screen.getBoundingClientRect();
  const scale = getScaleFactor();
  const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
  sendMessage({ 
    type: 'mousedown', 
    x: (e.clientX - rect.left) * scale.x, 
    y: (e.clientY - rect.top) * scale.y, 
    button: buttonMap[e.button] 
  });
}

function handleMouseUp(e) {
  if (!isConnected) return;
  const screen = document.getElementById('browserScreen');
  const rect = screen.getBoundingClientRect();
  const scale = getScaleFactor();
  const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
  sendMessage({ 
    type: 'mouseup', 
    x: (e.clientX - rect.left) * scale.x, 
    y: (e.clientY - rect.top) * scale.y, 
    button: buttonMap[e.button] 
  });
}

function handleClick(e) {
  if (!isConnected) return;
  const screen = document.getElementById('browserScreen');
  const rect = screen.getBoundingClientRect();
  const scale = getScaleFactor();
  const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
  sendMessage({ 
    type: 'click', 
    x: (e.clientX - rect.left) * scale.x, 
    y: (e.clientY - rect.top) * scale.y, 
    button: buttonMap[e.button] 
  });
}

function handleDoubleClick(e) {
  if (!isConnected) return;
  const screen = document.getElementById('browserScreen');
  const rect = screen.getBoundingClientRect();
  const scale = getScaleFactor();
  sendMessage({ 
    type: 'dblclick', 
    x: (e.clientX - rect.left) * scale.x, 
    y: (e.clientY - rect.top) * scale.y 
  });
}

function handleWheel(e) {
  if (!isConnected) return;
  e.preventDefault();
  sendMessage({ type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
}

function handleKeyDown(e) {
  if (!isConnected) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Tab') e.preventDefault();
  sendMessage({ type: 'keydown', key: e.key });
}

function handleKeyUp(e) {
  if (!isConnected) return;
  if (e.target.tagName === 'INPUT') return;
  sendMessage({ type: 'keyup', key: e.key });
}

function updateConnectionStatus() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const loadingScreen = document.getElementById('loadingScreen');
  const screenImage = document.getElementById('screenImage');
  const screenOverlay = document.getElementById('screenOverlay');
  const disconnectedOverlay = document.getElementById('disconnectedOverlay');
  if (!statusDot) return;
  if (isConnected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (screenImage) screenImage.classList.remove('hidden');
    if (screenOverlay) screenOverlay.classList.remove('hidden');
    if (disconnectedOverlay) disconnectedOverlay.classList.add('hidden');
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    if (screenOverlay) screenOverlay.classList.add('hidden');
    if (disconnectedOverlay) disconnectedOverlay.classList.remove('hidden');
  }
}

function updateScreenshot() {
  const screenImage = document.getElementById('screenImage');
  if (screenImage && screenshot) screenImage.src = screenshot;
}

function updateUrlBar() {
  const urlInput = document.getElementById('urlInput');
  if (urlInput) urlInput.value = currentUrl;
}

async function init() {
  const isAuthenticated = await verifyToken();
  if (isAuthenticated) showBrowserPage();
  else showLoginPage();
}

init();
