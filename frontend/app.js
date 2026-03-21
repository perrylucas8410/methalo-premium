// Multi-domain support - works on localhost, 127.0.0.1, and premium.methalo.online
const API_URL = (() => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:3001';
  }
  // For production domains like premium.methalo.online
  // Use relative URL (same origin) or specify the backend URL
  return ''; // Empty string means same origin (relative URLs)
})();

const WS_URL = (() => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://127.0.0.1:3001';
  }
  // For production, use wss (secure WebSocket)
  return `wss://${window.location.host}`;
})();

let currentUser = null;
let isAdmin = false;
let authToken = localStorage.getItem('token');
let wsConnection = null;
let isConnected = false;
let screenshot = null;
let currentUrl = '';
let tabs = [];
let activeTabId = null;
let heartbeatInterval = null;
let browserSessionId = null;
let adminData = { users: [], sessions: [], stats: {} };

const app = document.getElementById('app');

// Heartbeat management
function startHeartbeat() {
  if (isAdmin) return; // Admin panel doesn't need heartbeat
  heartbeatInterval = setInterval(async () => {
    if (!authToken) return;
    try {
      const response = await fetch(`${API_URL}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!response.ok) {
        console.log('[Heartbeat] Session expired');
        logout();
      }
    } catch (error) {
      console.error('[Heartbeat] Error:', error);
    }
  }, 2000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function verifyToken() {
  if (!authToken) return false;
  try {
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      currentUser = { username: data.username, userId: data.userId };
      isAdmin = data.isAdmin || false;
      if (!isAdmin) {
        tabs = data.tabs || [];
        activeTabId = data.activeTabId;
        browserSessionId = data.browserSessionId;
      }
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
    isAdmin = data.isAdmin || false;
    if (!isAdmin) {
      tabs = data.tabs || [];
      activeTabId = data.activeTabId;
      browserSessionId = data.browserSessionId;
    }
    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

async function logout() {
  stopHeartbeat();
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
  isAdmin = false;
  tabs = [];
  activeTabId = null;
  browserSessionId = null;
  adminData = { users: [], sessions: [], stats: {} };
  showLoginPage();
}

function connectWebSocket() {
  if (!authToken || isAdmin) return;
  const wsUrl = `${WS_URL}/ws/browser?token=${encodeURIComponent(authToken)}`;
  wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => { 
    isConnected = true; 
    updateConnectionStatus(); 
    startHeartbeat();
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'connected':
          if (message.url) { currentUrl = message.url; updateUrlBar(); }
          if (message.tabs) { tabs = message.tabs; updateTabs(); }
          if (message.activeTabId) { activeTabId = message.activeTabId; updateTabs(); }
          break;
        case 'screenshot':
          screenshot = `data:image/jpeg;base64,${message.data}`;
          updateScreenshot();
          if (message.tabs) { tabs = message.tabs; updateTabs(); }
          if (message.activeTabId) { activeTabId = message.activeTabId; updateTabs(); }
          break;
        case 'navigated':
          currentUrl = message.url;
          updateUrlBar();
          if (message.tabs) { tabs = message.tabs; updateTabs(); }
          if (message.activeTabId) { activeTabId = message.activeTabId; updateTabs(); }
          break;
      }
    } catch (error) { console.error('WebSocket message error:', error); }
  };
  
  wsConnection.onclose = () => { 
    isConnected = false; 
    updateConnectionStatus(); 
    stopHeartbeat();
  };
  
  wsConnection.onerror = () => { 
    isConnected = false; 
    updateConnectionStatus(); 
    stopHeartbeat();
  };
}

function disconnectWebSocket() {
  stopHeartbeat();
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

// ==================== LOGIN PAGE ====================

function showLoginPage() {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <div class="login-header">
          <h1>Methalo Browser</h1>
          <p>Access your Methalo browser</p>
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
  if (result.success) {
    if (isAdmin) {
      showAdminPanel();
    } else {
      showBrowserPage();
    }
  } else {
    const className = result.error.includes('in use') ? 'info-message' : 'error-message';
    errorDiv.innerHTML = `<div class="${className}">${result.error}</div>`;
    button.disabled = false;
    button.textContent = 'Sign In';
  }
}

// ==================== ADMIN PANEL ====================

async function fetchAdminData() {
  try {
    const [usersRes, sessionsRes, statsRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/users`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
      fetch(`${API_URL}/api/admin/sessions`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
      fetch(`${API_URL}/api/admin/stats`, { headers: { 'Authorization': `Bearer ${authToken}` } })
    ]);
    
    if (usersRes.ok) adminData.users = await usersRes.json();
    if (sessionsRes.ok) adminData.sessions = await sessionsRes.json();
    if (statsRes.ok) adminData.stats = await statsRes.json();
  } catch (error) {
    console.error('Failed to fetch admin data:', error);
  }
}

async function showAdminPanel() {
  await fetchAdminData();
  
  app.innerHTML = `
    <div class="admin-container">
      <!-- Admin Header -->
      <div class="admin-header">
        <div class="admin-header-left">
          <h1>Admin Panel</h1>
          <span class="admin-badge">Administrator</span>
        </div>
        <div class="admin-header-right">
          <span class="admin-username">${currentUser?.username || ''}</span>
          <button class="admin-signout" id="signoutButton">Sign Out</button>
        </div>
      </div>
      
      <!-- Admin Content -->
      <div class="admin-content">
        <!-- Stats Cards -->
        <div class="admin-stats">
          <div class="stat-card">
            <div class="stat-value">${adminData.stats.totalUsers || 0}</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${adminData.stats.activeUsers || 0}</div>
            <div class="stat-label">Active Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${adminData.stats.totalSessions || 0}</div>
            <div class="stat-label">Browser Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${adminData.stats.activeSessions || 0}</div>
            <div class="stat-label">Active Sessions</div>
          </div>
        </div>
        
        <!-- Browser Sessions Section -->
        <div class="admin-section">
          <div class="section-header">
            <h2>Browser Sessions</h2>
            <button class="admin-btn admin-btn-primary" id="refreshBtn">Refresh</button>
          </div>
          <div class="sessions-grid">
            ${adminData.sessions.map(session => `
              <div class="session-card ${session.active ? 'active' : 'inactive'}">
                <div class="session-header">
                  <span class="session-id">${session.id}</span>
                  <span class="session-status">${session.active ? 'Active' : 'Inactive'}</span>
                </div>
                <div class="session-info">
                  <p>Users: ${session.userCount} / ${session.maxUsers || '∞'}</p>
                  <p>Current URL: ${session.currentUrl || 'N/A'}</p>
                </div>
                <div class="session-actions">
                  <button class="admin-btn ${session.active ? 'admin-btn-danger' : 'admin-btn-success'}" 
                          onclick="toggleSession('${session.id}', ${session.active})">
                    ${session.active ? 'Stop Session' : 'Start Session'}
                  </button>
                  <button class="admin-btn admin-btn-secondary" onclick="restartSession('${session.id}')">
                    Restart
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Users Section -->
        <div class="admin-section">
          <div class="section-header">
            <h2>User Management</h2>
            <button class="admin-btn admin-btn-primary" id="addUserBtn">+ Add User</button>
          </div>
          <div class="users-table-container">
            <table class="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Session</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${adminData.users.map(user => `
                  <tr>
                    <td>${user.username}</td>
                    <td><span class="user-type ${user.isAdmin ? 'admin' : 'user'}">${user.isAdmin ? 'Admin' : 'User'}</span></td>
                    <td><span class="user-status ${user.isActive ? 'online' : 'offline'}">${user.isActive ? 'Online' : 'Offline'}</span></td>
                    <td>${user.sessionId || '-'}</td>
                    <td>
                      <button class="admin-btn admin-btn-small" onclick="editUser('${user.username}')">Edit</button>
                      <button class="admin-btn admin-btn-small admin-btn-danger" onclick="deleteUser('${user.username}')">Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add User Modal -->
    <div class="modal hidden" id="addUserModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add New User</h3>
          <button class="modal-close" id="closeModal">&times;</button>
        </div>
        <form id="addUserForm">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="newUsername" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="newPassword" required />
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="newIsAdmin" />
              Admin Account
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="admin-btn" id="cancelAddUser">Cancel</button>
            <button type="submit" class="admin-btn admin-btn-primary">Add User</button>
          </div>
        </form>
      </div>
    </div>`;
  
  // Event listeners
  document.getElementById('signoutButton').addEventListener('click', logout);
  document.getElementById('refreshBtn').addEventListener('click', showAdminPanel);
  document.getElementById('addUserBtn').addEventListener('click', showAddUserModal);
  document.getElementById('closeModal').addEventListener('click', hideAddUserModal);
  document.getElementById('cancelAddUser').addEventListener('click', hideAddUserModal);
  document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
}

function showAddUserModal() {
  document.getElementById('addUserModal').classList.remove('hidden');
}

function hideAddUserModal() {
  document.getElementById('addUserModal').classList.add('hidden');
  document.getElementById('addUserForm').reset();
}

async function handleAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const isAdminUser = document.getElementById('newIsAdmin').checked;
  
  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password, isAdmin: isAdminUser })
    });
    
    if (response.ok) {
      hideAddUserModal();
      showAdminPanel(); // Refresh
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to add user');
    }
  } catch (error) {
    console.error('Failed to add user:', error);
    alert('Failed to add user');
  }
}

async function toggleSession(sessionId, isActive) {
  try {
    const response = await fetch(`${API_URL}/api/admin/sessions/${sessionId}/toggle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      showAdminPanel(); // Refresh
    } else {
      alert('Failed to toggle session');
    }
  } catch (error) {
    console.error('Failed to toggle session:', error);
  }
}

async function restartSession(sessionId) {
  if (!confirm('Are you sure you want to restart this session? All connected users will be disconnected.')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/admin/sessions/${sessionId}/restart`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      showAdminPanel(); // Refresh
    } else {
      alert('Failed to restart session');
    }
  } catch (error) {
    console.error('Failed to restart session:', error);
  }
}

async function editUser(username) {
  const newPassword = prompt(`Enter new password for ${username}:`);
  if (!newPassword) return;
  
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${username}`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    });
    
    if (response.ok) {
      alert('Password updated successfully');
      showAdminPanel(); // Refresh
    } else {
      alert('Failed to update user');
    }
  } catch (error) {
    console.error('Failed to update user:', error);
  }
}

async function deleteUser(username) {
  if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${username}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      showAdminPanel(); // Refresh
    } else {
      alert('Failed to delete user');
    }
  } catch (error) {
    console.error('Failed to delete user:', error);
  }
}

// ==================== BROWSER PAGE ====================

function showBrowserPage() {
  app.innerHTML = `
    <div class="browser-container">
      <!-- Tab Bar with Navigation -->
      <div class="tab-bar">
        <div class="tab-bar-left">
          <!-- Navigation Buttons -->
          <div class="nav-buttons">
            <button class="nav-button" id="backButton" title="Go Back">←</button>
            <button class="nav-button" id="forwardButton" title="Go Forward">→</button>
            <button class="nav-button" id="reloadButton" title="Reload">↻</button>
          </div>
          
          <!-- Tabs Container -->
          <div class="tabs-container" id="tabsContainer">
            <!-- Tabs will be rendered here -->
          </div>
          
          <!-- New Tab Button -->
          <button class="new-tab-button" id="newTabButton" title="New Tab">+</button>
        </div>
        
        <div class="tab-bar-right">
          <!-- URL Bar -->
          <form class="url-bar" id="urlForm">
            <input type="text" id="urlInput" placeholder="Enter URL..." />
            <button type="submit" class="go-button">Go</button>
          </form>
          
          <!-- Connection Status -->
          <div class="connection-status">
            <span class="status-dot" id="statusDot"></span>
          </div>
          
          <!-- Profile Menu -->
          <div class="profile-menu-container">
            <button class="profile-button" id="profileButton" title="Profile Menu">
              <span class="profile-initial">${currentUser?.username?.charAt(0).toUpperCase() || 'U'}</span>
            </button>
            <div class="profile-dropdown hidden" id="profileDropdown">
              <div class="profile-info">
                <span class="profile-username">${currentUser?.username || ''}</span>
                <span class="profile-session">${browserSessionId || ''}</span>
              </div>
              <div class="profile-divider"></div>
              <button class="profile-signout" id="signoutButton">
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Browser Viewport -->
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
  
  // Event listeners
  document.getElementById('backButton').addEventListener('click', () => sendMessage({ type: 'goback' }));
  document.getElementById('forwardButton').addEventListener('click', () => sendMessage({ type: 'goforward' }));
  document.getElementById('reloadButton').addEventListener('click', () => sendMessage({ type: 'reload' }));
  document.getElementById('urlForm').addEventListener('submit', handleNavigate);
  document.getElementById('reconnectButton').addEventListener('click', connectWebSocket);
  document.getElementById('newTabButton').addEventListener('click', createNewTab);
  document.getElementById('signoutButton').addEventListener('click', logout);
  
  // Profile menu toggle
  const profileButton = document.getElementById('profileButton');
  const profileDropdown = document.getElementById('profileDropdown');
  profileButton.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
  });
  
  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && e.target !== profileButton) {
      profileDropdown.classList.add('hidden');
    }
  });
  
  // Mouse/keyboard events
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

async function createNewTab() {
  try {
    const response = await fetch(`${API_URL}/api/browser/tab`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: 'https://www.google.com' })
    });
    
    if (response.ok) {
      const data = await response.json();
      tabs = data.tabs;
      activeTabId = data.activeTabId;
      updateTabs();
    }
  } catch (error) {
    console.error('Failed to create tab:', error);
  }
}

async function switchTab(tabId) {
  try {
    const response = await fetch(`${API_URL}/api/browser/tab/switch`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tabId })
    });
    
    if (response.ok) {
      const data = await response.json();
      tabs = data.tabs;
      activeTabId = data.activeTabId;
      updateTabs();
    }
  } catch (error) {
    console.error('Failed to switch tab:', error);
  }
}

async function closeTab(tabId, event) {
  event.stopPropagation();
  
  try {
    const response = await fetch(`${API_URL}/api/browser/tab/${tabId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      tabs = data.tabs;
      activeTabId = data.activeTabId;
      updateTabs();
    }
  } catch (error) {
    console.error('Failed to close tab:', error);
  }
}

function updateTabs() {
  const container = document.getElementById('tabsContainer');
  if (!container) return;
  
  container.innerHTML = tabs.map(tab => `
    <div class="tab ${tab.id === activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
      <span class="tab-title">${tab.title || 'New Tab'}</span>
      <button class="tab-close" data-tab-id="${tab.id}">×</button>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.tab').forEach(tabEl => {
    tabEl.addEventListener('click', () => {
      const tabId = tabEl.dataset.tabId;
      if (tabId !== activeTabId) {
        switchTab(tabId);
      }
    });
  });
  
  container.querySelectorAll('.tab-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
      const tabId = closeBtn.dataset.tabId;
      closeTab(tabId, e);
    });
  });
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
  const loadingScreen = document.getElementById('loadingScreen');
  const screenImage = document.getElementById('screenImage');
  const screenOverlay = document.getElementById('screenOverlay');
  const disconnectedOverlay = document.getElementById('disconnectedOverlay');
  if (!statusDot) return;
  if (isConnected) {
    statusDot.classList.add('connected');
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (screenImage) screenImage.classList.remove('hidden');
    if (screenOverlay) screenOverlay.classList.remove('hidden');
    if (disconnectedOverlay) disconnectedOverlay.classList.add('hidden');
  } else {
    statusDot.classList.remove('connected');
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
  if (isAuthenticated) {
    if (isAdmin) {
      showAdminPanel();
    } else {
      showBrowserPage();
    }
  } else {
    showLoginPage();
  }
}

init();
