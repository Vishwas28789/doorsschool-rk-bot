const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRkResponse } = require('./bot_logic');
const memoryManager = require('./memory_manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TEST_USER = "test_user_001";

app.use(express.static(path.join(__dirname, 'public')));

app.post('/reset', (req, res) => {
    memoryManager.clearSession(TEST_USER);
    res.json({ success: true });
});

// BUG 2 Fix: Track active sockets and deduplicate messages
const activeSockets = new Set();
const messageCache = new Map(); // For 2s deduplication

io.on('connection', (socket) => {
    // BUG 2 Fix: Add socket to active set
    activeSockets.add(socket.id);
    console.log(`User connected to UI: ${socket.id}`);

    // Send existing history to the client
    const session = memoryManager.getOrCreateSession(TEST_USER);
    socket.emit('history', session.history);

    // TASK 4: GREETING FIX for brand new sessions
    if (session.history.length === 0) {
        setTimeout(() => {
            // Check if socket is still active
            if (!activeSockets.has(socket.id)) return;

            const greeting = "Hey, glad you reached out. I'm Rk — started Doorsschool after watching too many sharp people stay broke because nobody taught them how to actually sell or build a real business system. What's the one thing holding you back right now — income, clients, skills, or just feeling stuck?";
            
            socket.emit('rk_response', {
                content: greeting,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            // Persist the greeting in memory so it's not sent again
            memoryManager.addMessage(TEST_USER, 'rk', greeting);
        }, 1500);
    }

    socket.on('message', async (msg) => {
        // BUG 2 Fix: Process only if socket is active and message is not duplicate
        if (!activeSockets.has(socket.id)) return;

        const now = Date.now();
        const cacheKey = `${TEST_USER}:${msg}`;
        const lastSent = messageCache.get(cacheKey);

        if (lastSent && (now - lastSent < 2000)) {
            console.log(`Duplicate message ignored from ${socket.id}`);
            return;
        }
        messageCache.set(cacheKey, now);

        console.log(`UI Message: ${msg}`);
        
        // Show typing indicator on client
        socket.emit('typing', true);

        try {
            // Random human-like delay (1-3 seconds)
            const delay = Math.floor(Math.random() * 2000) + 1000;
            
            const response = await getRkResponse(TEST_USER, msg);

            setTimeout(() => {
                if (!activeSockets.has(socket.id)) return;
                socket.emit('typing', false);
                socket.emit('rk_response', {
                    content: response,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }, delay);

        } catch (error) {
            console.error('UI Logic Error:', error);
            socket.emit('typing', false);
            socket.emit('rk_response', {
                content: "Hey! Just lost my connection for a second. What were we saying?",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    socket.on('disconnect', () => {
        activeSockets.delete(socket.id);
        console.log(`User disconnected from UI: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`WhatsApp Test UI running at http://localhost:${PORT}`);
});
