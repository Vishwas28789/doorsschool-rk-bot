const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'conversations.json');

function logMessage(data) {
    let conversations = [];
    if (fs.existsSync(LOG_FILE)) {
        try {
            conversations = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        } catch (e) {
            console.error('Error reading conversations.json', e);
        }
    }

    const entry = {
        userId: data.userId,
        userName: data.userName || "Unknown",
        userMessage: data.userMessage,
        botResponse: data.botResponse,
        phase: data.phase || 1,
        interestLevel: data.interestLevel || "Medium",
        timestamp: new Date().toISOString(),
        sessionId: data.sessionId || data.userId
    };

    conversations.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(conversations, null, 2));
}

function getConversations() {
    if (fs.existsSync(LOG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function getStats() {
    const conversations = getConversations();
    const webinarLink = process.env.WEBINAR_LINK || "";
    
    const today = new Date().toISOString().split('T')[0];
    const activeToday = new Set(
        conversations
            .filter(c => c.timestamp.startsWith(today))
            .map(c => c.userId)
    ).size;

    const webinarSignups = conversations.filter(c => c.botResponse.includes(webinarLink)).length;
    const totalConversations = new Set(conversations.map(c => c.userId)).size;
    const conversionRate = totalConversations > 0 
        ? ((webinarSignups / totalConversations) * 100).toFixed(1) + '%' 
        : '0%';

    return {
        totalConversations,
        activeToday,
        webinarSignups,
        conversionRate
    };
}

module.exports = {
    logMessage,
    getConversations,
    getStats
};
