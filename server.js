const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRkResponse } = require('./bot_logic');
const memoryManager = require('./memory_manager');
const logger = require('./logger');
const knowledgeBase = require('./knowledge_base');
const sandbox = require('./sandbox');
const fs = require('fs');
const dotenv = require('dotenv');
const session = require('express-session');




const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TEST_USER = "test_user_001";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SESSION SETUP
app.use(session({
    secret: process.env.SESSION_SECRET || 'rk-admin-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// AUTH MIDDLEWARE
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.redirect('/admin/login');
}

// LOGIN ROUTES (NOT PROTECTED)
app.get('/admin/login', (req, res) => {
    res.sendFile(__dirname + '/admin-login.html');
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.redirect('/admin');
    }
    res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// APPLY PROTECTION TO ALL /admin ROUTES (except login)
app.use('/admin', requireAdmin);

app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});



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

// --- ADMIN API ROUTES ---

app.get('/admin/api/stats', (req, res) => {

    res.json(logger.getStats());
});

// GET /admin/api/conversations
app.get('/admin/api/conversations', (req, res) => {
    res.json(logger.getConversations().reverse()); // Newest first
});

// GET /admin/api/knowledge
app.get('/admin/api/knowledge', (req, res) => {
    res.json(knowledgeBase.getEntries());
});

// POST /admin/api/knowledge/add
app.post('/admin/api/knowledge/add', (req, res) => {
    const { tag, content } = req.body;
    const entry = knowledgeBase.addEntry(tag, content);
    res.json(entry);
});

// POST /admin/api/knowledge/deploy
app.post('/admin/api/knowledge/deploy', (req, res) => {
    const { id } = req.body;
    const entry = knowledgeBase.deployEntry(id);
    res.json(entry);
});

// DELETE /admin/api/knowledge/:id
app.delete('/admin/api/knowledge/:id', (req, res) => {
    knowledgeBase.deleteEntry(req.params.id);
    res.json({ success: true });
});

// POST /admin/api/sandbox/staging
app.post('/admin/api/sandbox/staging', async (req, res) => {
    const { message } = req.body;
    const response = await sandbox.sandboxChat(message, 'staging');
    res.json({ response });
});

// POST /admin/api/sandbox/live
app.post('/admin/api/sandbox/live', async (req, res) => {
    const { message } = req.body;
    const response = await sandbox.sandboxChat(message, 'live');
    res.json({ response });
});

// POST /admin/api/sandbox/reset
app.post('/admin/api/sandbox/reset', (req, res) => {
    sandbox.resetSandbox();
    res.json({ success: true });
});

// GET /admin/api/settings
app.get('/admin/api/settings', (req, res) => {
    res.json({
        webinarLink: process.env.WEBINAR_LINK,
        botName: "RK", // Could be from a config file if needed
        groqModel: "llama-3.1-8b-instant",
        tokenUsage: "Estimated 0.5k tokens/chat"
    });
});

// POST /admin/api/settings/update
app.post('/admin/api/settings/update', (req, res) => {
    const { key, value } = req.body;
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    process.env[key] = value; // Update in memory too
    res.json({ success: true });
});

server.listen(PORT, () => {

    console.log(`WhatsApp Test UI running at http://localhost:${PORT}`);
});
