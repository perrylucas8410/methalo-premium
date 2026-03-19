What We’re Building: Methalo Browser (Cloud‑Rendered WebKit Browser)
Methalo is a cloud‑rendered browser, similar in spirit to services like Puffin or Amazon Silk.
Instead of rendering pages locally, Methalo runs a headless WebKit engine on the server, streams the output to the client, and sends user input back over WebRTC.

In plain terms:
The backend launches WebKit using Playwright

It captures the rendered frames

It streams them to the frontend via WebRTC video

The frontend sends mouse + keyboard events back to the backend

The backend injects those events into WebKit

The user sees a fully interactive remote browser

This gives you:

Isolation

Speed

No local resource usage

Ability to run on any device

🧱 Project Architecture
1. Backend (Node.js + Playwright WebKit + WebRTC)
Located in:

Code
/backend
Responsibilities:

Launch a persistent WebKit session

Manage multiple tabs

Stream the browser output as a WebRTC video track

Receive input events (mouse, keyboard, scroll)

Inject events into WebKit

Handle login + session tokens

Provide REST API for:

/api/session/attach

/api/session/tabs

/api/session/tab/create

/api/session/tab/switch

/api/session/tab/close

/api/auth/logout

2. Frontend (HTML + JS + WebRTC client)
Located in:

Code
/frontend
Responsibilities:

Connect to backend via WebRTC

Display the streamed video in a <video> or <canvas>

Capture user input and send it back

Render tab UI

Handle login + logout

Manage active tab state

🎯 Current State of the Project
✔ Backend is working
WebKit launches

WebRTC server runs

API endpoints respond

Session attach works

Tabs API works

✔ Frontend loads
Login works

UI loads

WebRTC client initializes

❗ One JS error was breaking everything
apiFetch redeclared → entire script stopped

Fixed by renaming to apiRequest

❗ After fixing that, the UI now runs
Tabs work

Signout works

WebRTC input works

Video should render once WebRTC handshake completes

📦 What Replit Needs To Do
Here’s the exact list of tasks Replit developers should focus on:

1. Ensure WebRTC video renders correctly
Verify startWebRTC() attaches the remote track to videoEl

Confirm backend sends frames

Confirm frontend draws frames (video or canvas)

2. Verify tab management
/api/session/tab/create

/api/session/tab/switch

/api/session/tab/close

3. Clean up frontend event wiring
Ensure all buttons have listeners

Ensure DOM loads before JS runs

Ensure no duplicate script imports

4. Confirm backend stability
WebKit launches reliably

Sessions persist

Tabs don’t crash the engine

5. Optional polish
Add loading states

Add error handling

Improve tab titles

Add favicon fetching

📘 Paste This Into Your GitHub README
Here’s a clean, copy‑ready description:

Code
# Methalo Browser (Cloud‑Rendered WebKit Browser)

Methalo is a cloud‑rendered browser that runs WebKit on the server and streams
the output to the client using WebRTC. The frontend sends mouse/keyboard input
back to the backend, which injects it into the WebKit instance. This creates a
fully interactive remote browser similar to Puffin or Amazon Silk.

## Architecture

### Backend (Node.js + Playwright WebKit)
- Launches WebKit in headless mode
- Streams frames over WebRTC
- Receives input events and injects them into WebKit
- Manages tabs and sessions
- Provides REST API for session attach, tab creation, switching, closing, and logout

### Frontend (HTML + JS)
- Connects to backend via WebRTC
- Displays streamed video
- Sends mouse/keyboard events back to backend
- Renders tab UI and session controls

## What Needs Work
- Ensure WebRTC video renders correctly
- Verify tab management endpoints
- Clean up frontend event listeners
- Confirm backend stability under multiple tabs