const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'sessions.json');

class MemoryManager {
    constructor() {
        this.sessions = this.loadSessions();
    }

    // BUG 3 Fix: Robust load logic
    loadSessions() {
        try {
            if (fs.existsSync(SESSION_FILE)) {
                const raw = fs.readFileSync(SESSION_FILE, 'utf8').trim();
                if (raw && raw !== '' && (raw !== '{}' || raw === '{}')) {
                    return JSON.parse(raw || '{}');
                } else {
                    return {};
                }
            } else {
                return {};
            }
        } catch (e) {
            console.log('Sessions reset due to error:', e.message);
            fs.writeFileSync(SESSION_FILE, '{}', 'utf8');
            return {};
        }
    }

    // BUG 3 Fix: Always use utf8 encoding
    saveSessions() {
        try {
            fs.writeFileSync(SESSION_FILE, JSON.stringify(this.sessions, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving sessions:', error);
        }
    }

    clearSession(userId) {
        delete this.sessions[userId];
        this.saveSessions();
    }

    getOrCreateSession(userId) {
        if (!this.sessions[userId]) {
            this.sessions[userId] = {
                NAME: 'Unknown',
                PROFESSION: 'Unknown',
                PAIN: 'Unknown',
                GOAL: 'Unknown',
                STAGE: 'PHASE 1 — CONNECT',
                INTEREST_LEVEL: 'low',
                SUMMARY: 'New user, just reached out.',
                history: []
            };
            this.saveSessions();
        }
        return this.sessions[userId];
    }

    updateSession(userId, updates) {
        const session = this.getOrCreateSession(userId);
        Object.assign(session, updates);
        this.saveSessions();
    }

    addMessage(userId, role, content) {
        const session = this.getOrCreateSession(userId);
        session.history.push({ role, content, timestamp: Date.now() });
        
        if (session.history.length > 6) {
            session.history = session.history.slice(-6);
        }
        this.saveSessions();
    }

    getCompressedContext(userId) {
        const session = this.getOrCreateSession(userId);
        return {
            summary: session.SUMMARY || "New user.",
            recentMessages: session.history.slice(-4),
            stage: session.STAGE,
            interestLevel: session.INTEREST_LEVEL,
            name: session.NAME
        };
    }

    getSessionContext(userId) {
        const session = this.getOrCreateSession(userId);
        return `
NAME: ${session.NAME}
PROFESSION: ${session.PROFESSION}
PAIN: ${session.PAIN}
GOAL: ${session.GOAL}
STAGE: ${session.STAGE}
INTEREST LEVEL: ${session.INTEREST_LEVEL}
SUMMARY: ${session.SUMMARY}
        `.trim();
    }
}

module.exports = new MemoryManager();
