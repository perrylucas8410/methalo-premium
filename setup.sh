#!/bin/bash

echo "========================================"
echo "  Browser Platform Setup"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ is required. Current version: $(node --version)"
    exit 1
fi

echo "Node.js version: $(node --version)"
echo ""

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install backend dependencies"
    exit 1
fi

# Install Playwright Chromium
echo "Installing Playwright Chromium..."
npx playwright install chromium
if [ $? -ne 0 ]; then
    echo "Error: Failed to install Playwright Chromium"
    exit 1
fi

cd ..

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install frontend dependencies"
    exit 1
fi

cd ..

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "To start the application:"
echo ""
echo "1. Start the backend (Terminal 1):"
echo "   cd backend && npm start"
echo ""
echo "2. Start the frontend (Terminal 2):"
echo "   cd frontend && npm start"
echo ""
echo "Default login credentials:"
echo "  admin / admin123"
echo "  user1 / password1"
echo "  user2 / password2"
echo "  user3 / password3"
echo "  user4 / password4"
echo "  user5 / password5"
echo ""
echo "Features:"
echo "  - 5 shared browser sessions"
echo "  - Tab bar for multiple tabs"
echo "  - Profile menu with sign out"
echo "  - Heartbeat detection (5s timeout)"
echo "========================================"
