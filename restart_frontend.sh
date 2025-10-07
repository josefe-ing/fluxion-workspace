#!/bin/bash
# Kill current vite process
pkill -f "node.*vite" || true

# Wait a moment
sleep 1

# Start frontend dev server
cd frontend
npm run dev
