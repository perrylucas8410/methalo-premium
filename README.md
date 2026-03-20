# Browser Platform

A full-stack application that provides remote browser access with user management, session control, and real-time Chromium streaming.

## Features

- **User Authentication**: Secure login with JWT tokens
- **Session Management**: One device per account - prevents concurrent logins
- **Permanent Browser Sessions**: Each user has a dedicated Chromium instance
- **Real-time Streaming**: Low-latency browser view via WebSocket (30 FPS)
- **Full Interaction**: Mouse and keyboard forwarding to remote browser
- **Protected Routes**: Browser page only accessible when logged in

## Architecture

```
/backend    - Node.js/Express API with Playwright
/frontend   - Vanilla JS SPA with real-time browser view
```

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm

### Installation

```bash
cd browser-platform
chmod +x setup.sh
./setup.sh
```

Or manually:
```bash
cd backend && npm install && npx playwright install chromium
cd ../frontend && npm install
```

### Running

1. **Backend** (Terminal 1):
```bash
cd backend
npm start
```
Runs on `http://127.0.0.1:3001`

2. **Frontend** (Terminal 2):
```bash
cd frontend
npm start
```
Runs on `http://127.0.0.1:3000`

### Default Login Credentials

| Username | Password  |
|----------|-----------|
| admin    | admin123  |
| user1    | password1 |
| user2    | password2 |

## API Endpoints

- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/verify` - Verify token
- `GET /api/browser/connect` - Connect to browser
- `POST /api/browser/navigate` - Navigate to URL
- `GET /api/health` - Health check
- `WS /ws/browser?token=<jwt>` - WebSocket streaming

## Production

To use `premium.methalo.online`:

1. Update backend CORS in `server.js`
2. Update frontend API_URL in `app.js`
3. Use HTTPS/WSS

## License

MIT
