#!/bin/bash

echo "========================================"
echo "  Browser Platform Setup"
echo "========================================"
echo ""

node_version=$(node --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "Error: Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi
echo "Found Node.js $node_version"

echo ""
echo "Installing backend dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install backend dependencies"
    exit 1
fi

echo ""
echo "Installing Playwright Chromium browser..."
npx playwright install chromium
if [ $? -ne 0 ]; then
    echo "Warning: Failed to install Playwright browsers"
fi

cd ..

echo ""
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
echo "3. Open in browser:"
echo "   http://127.0.0.1:3000"
echo ""
echo "Default login credentials:"
echo "   admin / admin123"
echo "   user1 / password1"
echo "   user2 / password2"
echo ""
echo "========================================"
