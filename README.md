# Browser Platform v2.0

A full-stack application that provides remote browser access with shared sessions, tab management, and heartbeat-based session control.

![Browser Platform](https://img.shields.io/badge/Browser-Platform-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Shared Browser Sessions**: Multiple users share the same Chromium instances
- **Tab Bar**: Open, switch, and close tabs within the same browser session
- **Profile Menu**: Circle avatar with sign out dropdown
- **Heartbeat Detection**: Automatic session release after inactivity
- **Dynamic Scaling**: Browser viewport scales to fit any screen size
- **Real-time Streaming**: Low-latency browser view via WebSocket (30 FPS)
- **Full Interaction**: Mouse and keyboard forwarding to remote browser

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone or download the repository
cd methalo-premium

# Run the setup script
chmod +x setup.sh
./setup.sh
```

Or manually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Running

1. **Start the Backend** (Terminal 1):
```bash
cd backend
npm start
```
Backend runs on `http://127.0.0.1:3001`

2. **Start the Frontend** (Terminal 2):
```bash
cd frontend
npm start
```
Frontend runs on `http://127.0.0.1:3000`

3. **Open your browser** and go to `http://127.0.0.1:3000`

---

## Configuration Guide

### Adding Users

All users are configured in `backend/config.js`.

**To add a new user:**

1. Open `backend/config.js`
2. Add a new entry to the `users` array:

```javascript
users: [
  { username: 'admin', password: 'admin123' },
  { username: 'user1', password: 'password1' },
  { username: 'newuser', password: 'newpassword123' }  // Add this line
]
```

3. Save the file
4. Restart the backend server

### Adding More Browser Sessions

By default, 5 shared browser sessions are created. To add more:

1. Open `backend/config.js`
2. Change `numBrowserSessions` to your desired number:

```javascript
numBrowserSessions: 10  // Change from 5 to 10
```

3. Save the file
4. Restart the backend server

**RAM Usage Estimate:**
- Each Chromium session uses ~150-300MB RAM
- 5 sessions = ~750MB - 1.5GB
- 10 sessions = ~1.5GB - 3GB

### Adjusting Heartbeat Timeout

The heartbeat timeout controls how long a user session stays active after they close their browser.

1. Open `backend/config.js`
2. Change `heartbeatTimeout` (in milliseconds):

```javascript
heartbeatTimeout: 10000  // 10 seconds instead of 5
```

3. Save the file
4. Restart the backend server

---

## Default Login Credentials

| Username | Password  |
|----------|-----------|
| admin    | admin123  |
| user1    | password1 |
| user2    | password2 |
| user3    | password3 |
| user4    | password4 |
| user5    | password5 |

---

## How It Works

### Shared Sessions
- On startup, the backend creates multiple Chromium browser contexts (configurable)
- When a user logs in, they are assigned to the least-loaded session
- Multiple users can share the same browser session and see/control the same screen

### Tab Bar
- The tab bar replaces the traditional header
- Navigation buttons (back/forward/reload) are integrated
- Click the **+** button to open a new tab
- Click **×** on a tab to close it
- Click a tab to switch to it

### Profile Menu
- Click the circle avatar in the top-right corner
- Shows username and assigned session ID
- Click "Sign Out" to logout

### Heartbeat Detection
- Frontend sends heartbeat every 2 seconds while connected
- If no heartbeat received for 5 seconds (configurable), the session is released
- This allows users to reconnect after closing/reopening their browser

### Dynamic Scaling
- The browser viewport automatically scales to fit the available screen space
- Works on any screen size from mobile to 4K displays
- Maintains aspect ratio while maximizing usable area

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and status |
| `/api/auth/login` | POST | Login with credentials |
| `/api/auth/logout` | POST | Logout current user |
| `/api/auth/verify` | GET | Verify token validity |
| `/api/heartbeat` | POST | Send heartbeat ping |
| `/api/browser/connect` | GET | Connect to browser session |
| `/api/browser/navigate` | POST | Navigate to URL |
| `/api/browser/tab` | POST | Create new tab |
| `/api/browser/tab/switch` | POST | Switch to tab |
| `/api/browser/tab/:id` | DELETE | Close tab |
| `/ws/browser?token=<jwt>` | WS | WebSocket streaming |

---

## Project Structure

```
methalo-premium/
├── backend/
│   ├── server.js          # Main backend server
│   ├── config.js          # User and session configuration
│   └── package.json
├── frontend/
│   ├── app.js             # Frontend application logic
│   ├── styles.css         # Styling
│   ├── index.html         # HTML template
│   ├── server.js          # Frontend dev server
│   └── package.json
├── package.json           # Root package.json
├── setup.sh               # Setup script
└── README.md              # This file
```

---

## Troubleshooting

### "No browser sessions available"
- All browser sessions are in use
- Increase `numBrowserSessions` in `backend/config.js`
- Or wait for a user to disconnect

### "Session expired" after closing browser
- This is expected behavior due to heartbeat detection
- Simply log in again

### High RAM usage
- Reduce `numBrowserSessions` in `backend/config.js`
- Each session uses ~150-300MB RAM

### Cannot connect to backend
- Make sure backend is running on port 3001
- Check firewall settings
- Verify CORS settings in `backend/server.js`

---

## Security Notes

- Change the default JWT secret in production
- Use strong passwords in `backend/config.js`
- Consider adding rate limiting for production use
- Run behind a reverse proxy (nginx) with HTTPS in production

---

## License

MIT License - feel free to use and modify as needed.

---

## Support

For issues or questions, please check the troubleshooting section or review the configuration in `backend/config.js`.
