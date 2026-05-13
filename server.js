const express = require('express');
const path = require('path');
const { getRkResponse } = require('./bot_logic');
const memoryManager = require('./memory_manager');
const logger = require('./logger');
const knowledgeBase = require('./knowledge_base');
const sandbox = require('./sandbox');
const fs = require('fs');
const dotenv = require('dotenv');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./db');

dotenv.config();

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const TEST_USER = "test_user_001";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SESSION SETUP
app.use(require('express-session')({
  secret: process.env.SESSION_SECRET || 
    'rk-secret-fallback',
  resave: false,
  saveUninitialized: false,
  store: (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'placeholder')
    ? MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60,
        touchAfter: 24 * 3600,
        crypto: { secret: false }
      })
    : undefined,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
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



app.post('/reset', async (req, res) => {
    await memoryManager.clearSession(TEST_USER);
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
    const sessionPromise = memoryManager.getOrCreateSession(TEST_USER);
    sessionPromise.then(session => {
        socket.emit('history', session.history);

        // TASK 4: GREETING FIX for brand new sessions
        if (session.history.length === 0) {
            setTimeout(async () => {
                // Check if socket is still active
                if (!activeSockets.has(socket.id)) return;

                const greeting = "Hey, glad you reached out. I'm Rk — started Doorsschool after watching too many sharp people stay broke because nobody taught them how to actually sell or build a real business system. What's the one thing holding you back right now — income, clients, skills, or just feeling stuck?";
                
                socket.emit('rk_response', {
                    content: greeting,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                // Persist the greeting in memory so it's not sent again
                await memoryManager.addMessage(TEST_USER, 'rk', greeting);
            }, 1500);
        }
    });

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

app.get('/admin/api/stats', async (req, res) => {
    res.json(await logger.getStats());
});

// GET /admin/api/conversations
app.get('/admin/api/conversations', async (req, res) => {
    const convs = await logger.getConversations();
    res.json(convs.reverse()); // Newest first
});

// GET /admin/api/knowledge
app.get('/admin/api/knowledge', async (req, res) => {
    res.json(await knowledgeBase.getEntries());
});

// POST /admin/api/knowledge/add
app.post('/admin/api/knowledge/add', async (req, res) => {
    const { tag, content } = req.body;
    const entry = await knowledgeBase.addEntry(tag, content);
    res.json(entry);
});

// POST /admin/api/knowledge/deploy
app.post('/admin/api/knowledge/deploy', async (req, res) => {
    const { id } = req.body;
    const entry = await knowledgeBase.deployEntry(id);
    res.json(entry);
});

// DELETE /admin/api/knowledge/:id
app.delete('/admin/api/knowledge/:id', async (req, res) => {
    await knowledgeBase.deleteEntry(req.params.id);
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

const startServer = async () => {
  const dbConnected = await connectDB();
  if (dbConnected) {
    console.log('✅ Database ready');
  } else {
    console.log('⚠️ Running without database - sessions will not persist');
  }
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `✅ Server running on port ${PORT}`
    );
  });
};

startServer();
