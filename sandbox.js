const Groq = require('groq-sdk');
const knowledgeBase = require('./knowledge_base');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Isolated history for sandbox
let sandboxHistoryStaging = [];
let sandboxHistoryLive = [];

const BASE_PROMPT = `CRITICAL: Your name is Rk. User is NOT Rk. You are CEO of Doers School. Warm, direct, max 3 sentences. Webinar: Recorded demo. Link: ${process.env.WEBINAR_LINK || "Link soon"}. Rule: Drop link directly. NEVER say live, today, tonight, email, sent later.`;

async function sandboxChat(message, type = 'staging') {
    const history = type === 'staging' ? sandboxHistoryStaging : sandboxHistoryLive;
    
    // Get knowledge
    let knowledge = "";
    if (type === 'staging') {
        const stagingEntries = await knowledgeBase.getEntries("staging");
        const staging = stagingEntries.map(e => `[${e.tag}] ${e.content}`).join('\n');
        const live = await knowledgeBase.getLiveContext();
        knowledge = (live + "\n" + staging).trim();
    } else {
        knowledge = await knowledgeBase.getLiveContext();
    }

    const systemPrompt = BASE_PROMPT + (knowledge ? `\n\nLATEST UPDATES FROM DOERS SCHOOL:\n${knowledge}` : "");

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
    ];

    try {
        const completion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.1-8b-instant",
            max_tokens: 150,
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;
        
        // Update local sandbox history
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: response });

        return response;
    } catch (error) {
        console.error(`Sandbox ${type} error:`, error);
        return "Sandbox error: " + error.message;
    }
}

function resetSandbox() {
    sandboxHistoryStaging = [];
    sandboxHistoryLive = [];
}

async function sandboxChatLive(message) {
    return await sandboxChat(message, 'live');
}

module.exports = {
    sandboxChat,
    sandboxChatLive,
    resetSandbox
};
