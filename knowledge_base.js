const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const KNOWLEDGE_FILE = path.join(__dirname, 'knowledge.json');

function getEntries(status = null) {
    if (!fs.existsSync(KNOWLEDGE_FILE)) return [];
    try {
        const entries = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
        if (status) {
            return entries.filter(e => e.status === status);
        }
        return entries;
    } catch (e) {
        return [];
    }
}

function addEntry(tag, content) {
    const entries = getEntries();
    const newEntry = {
        id: uuidv4(),
        tag: tag, // Course/Webinar/Offer/Update/Other
        content: content,
        status: "staging",
        createdAt: new Date().toISOString()
    };
    entries.push(newEntry);
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(entries, null, 2));
    return newEntry;
}

function deployEntry(id) {
    const entries = getEntries();
    const entry = entries.find(e => e.id === id);
    if (entry) {
        entry.status = "live";
        fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(entries, null, 2));
    }
    return entry;
}

function deleteEntry(id) {
    let entries = getEntries();
    entries = entries.filter(e => e.id !== id);
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(entries, null, 2));
}

function getLiveContext() {
    const liveEntries = getEntries("live");
    return liveEntries.map(e => `[${e.tag}] ${e.content}`).join('\n');
}

module.exports = {
    addEntry,
    getEntries,
    deployEntry,
    deleteEntry,
    getLiveContext
};
