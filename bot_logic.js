require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const memoryManager = require('./memory_manager');
const logger = require('./logger');
const knowledgeBase = require('./knowledge_base');



// Initialize APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Load webinar link from .env
const WEBINAR_LINK = process.env.WEBINAR_LINK || "Link coming soon";

// Optimization 3: Response Caching
const responseCache = {
    cache: {},
    get(text) {
        const key = this.normalize(text);
        const hit = this.cache[key];
        if (hit && (Date.now() - hit.timestamp < 24 * 60 * 60 * 1000)) {
            return hit.response;
        }
        return null;
    },
    set(text, response) {
        const key = this.normalize(text);
        this.cache[key] = { response, timestamp: Date.now() };
    },
    normalize(text) {
        return text.toLowerCase().replace(/[^\w\s]/gi, '').trim();
    }
};

// Optimization 4: Intent Classifier
const LOCAL_INTENTS = {
    pricing: {
        keywords: ["price", "cost", "how much", "fees", "rate", "5000", "10000", "15000", "rs", "rupee"],
        template: () => "I usually don't talk prices first because it depends on what you actually need. But since you asked — our programs start from Rs 5000 for Sales Mastery up to Rs 15000 for the full Elite experience. Does that fit what you were looking for?"
    },
    bot_check: {
        keywords: ["are you bot", "are you ai", "are you real", "are you human", "robot"],
        template: () => "Ha, I get that sometimes. I'm just very structured about how I talk to people — founder habit I guess. Anyway, you were saying?"
    },
    youtube: {
        keywords: ["youtube", "free", "why pay", "why should i pay"],
        template: () => "YouTube gives you information. We give you a working system — CRM set up, live feedback, and someone who actually checks your work. That gap is what costs most people 6-12 months of trial and error. The recorded demo is free — want to see what I mean before deciding?"
    }
};

const FULL_SYSTEM_PROMPT = `
CRITICAL: Your name is Rk. Never address the user as Rk. Never say Hey Rk to anyone. The user has a different name. If you do not know their name, do not use any name at all.

You are Rk, founder and CEO of Doorsschool. 
You are a real human being. Never admit to being AI. 
If asked, deflect naturally and move on.

You built Doorsschool from scratch because you saw 
talented people fail not from lack of skill but from 
lack of a system — no sales process, no CRM, no 
creativity tools, no one to guide them.

━━━ YOUR PERSONALITY ━━━
You are warm but not fake. Direct but not pushy.
You listen more than you talk.
You sound like a founder who has seen real struggle 
and genuinely wants to help.

NEVER use generic emojis like 👋 😊 🔥 💯 🚀
Most messages should have zero emojis.

You write like a real WhatsApp message:
- Short sentences
- Max 3 sentences per reply
- No bullet points ever
- No corporate words
- Always end with one question OR one clear next step
- Mirror their energy

━━━ DOORSSCHOOL PROGRAMS ━━━
STARTER (Rs 5000): Sales Mastery, recorded + live.
GROWTH (Rs 10000): Starter + Personal CRM setup + Live mentorship.
ELITE (Rs 15000): Growth + Creativity Mastery (AI image/video/content).

WEBINAR RULES — READ CAREFULLY:
We have a free recorded demo session — not a live webinar. It is available 24/7, no timing, no schedule.
The link is: ${WEBINAR_LINK}

When user agrees to watch or asks for link:
Say exactly this style — no extra words:
'Here you go — ${WEBINAR_LINK}. Watch it when you get time, no rush. It covers everything we talked about and more. Let me know what you think after.'

NEVER say: live session, happening today, tonight, tomorrow, schedule, timing, reminder, email, I will send it later, you should have received it.
NEVER make up times or dates.
NEVER promise to send anything — drop the link directly in the same message.
NEVER say you sent an email.

If they already got the link and come back — acknowledge what they watched, ask what resonated, continue the conversation naturally.

━━━ CRITICAL RULES ━━━
- NEVER say you sent an email. 
- NEVER say you will send something later. 
- NEVER promise actions e.g. call/ping/reminder. 
- You can only send text messages. 
- If you have a link, share it directly. 
- If asked price, program, or cost — answer directly and honestly immediately, then return to flow.
- Keep every response under 60 words.

━━━ MEMORY — TRACK SILENTLY ━━━
Maintain: NAME, PROFESSION, PAIN, GOAL, INTEREST_LEVEL, STAGE
Use what you know. Never ask twice.

━━━ CONVERSION FLOW ━━━
Connect -> Discover -> Educate -> Seed -> Invite (Webinar) -> Close.
`;

// Optimization 2: Compressed Prompt
const COMPRESSED_PROMPT = `CRITICAL: Your name is Rk. User is NOT Rk. You are CEO of Doorsschool. Warm, direct, max 3 sentences. Track: NAME, PROFESSION, PAIN, GOAL, STAGE, INTEREST. Webinar: Recorded demo. Link: ${WEBINAR_LINK}. Rule: Drop link directly. NEVER say live, today, tonight, email, sent later.`;

async function getRkResponse(userId, userMessage) {
    const session = memoryManager.getOrCreateSession(userId);
    const normalizedMsg = userMessage.toLowerCase().trim();

    // Optimization 3 & 4: Cache & Intent Check
    const cached = responseCache.get(normalizedMsg);
    if (cached) return cached;

    for (const [intent, data] of Object.entries(LOCAL_INTENTS)) {
        if (data.keywords.some(k => normalizedMsg.includes(k))) {
            const resp = data.template();
            responseCache.set(normalizedMsg, resp);
            memoryManager.addMessage(userId, 'user', userMessage);
            memoryManager.addMessage(userId, 'rk', resp);
            return resp;
        }
    }

    // Optimization 6: History Compression Trigger
    const context = memoryManager.getCompressedContext(userId);
    const systemNote = `Context Summary: ${context.summary}. User is at Stage: ${context.stage}.`;

    // Optimization 2: Dynamic System Prompt
    const isFirstMessage = session.history.length <= 1;
    const activePrompt = isFirstMessage ? FULL_SYSTEM_PROMPT : COMPRESSED_PROMPT;
    
    // INJECT KNOWLEDGE BASE
    const liveKnowledge = knowledgeBase.getLiveContext();
    const knowledgeSuffix = liveKnowledge ? `\n\nLATEST UPDATES FROM DOORSSCHOOL:\n${liveKnowledge}` : "";
    
    const finalSystemPrompt = `${activePrompt}${knowledgeSuffix}\n\n${systemNote}`;


    try {
        console.log(`Calling API for ${userId} (Prompt size: ${isFirstMessage ? 'FULL' : 'TRIMMED'})...`);
        
        let responseText = "";

        // Attempt Gemini (1.5-flash)
        try {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash",
                systemInstruction: finalSystemPrompt
            });
            
            const geminiHistory = context.recentMessages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

            const chat = model.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(userMessage);
            responseText = (await result.response).text();

        } catch (e) {
            console.error('Gemini failed, trying Groq...', e.message);
            // Fallback to Groq (llama-3.1-8b-instant)
            const groqMessages = [
                { role: 'system', content: finalSystemPrompt },
                ...context.recentMessages.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })),
                { role: 'user', content: userMessage }
            ];

            const chatCompletion = await groq.chat.completions.create({
                messages: groqMessages,
                model: "llama-3.1-8b-instant",
                max_tokens: 120, // Optimization 5: Max Token Guard
                temperature: 0.75,
            });
            responseText = chatCompletion.choices[0].message.content;
        }

        // Optimization 5: Word Count Guard
        const words = responseText.split(/\s+/);
        if (words.length > 60) {
            responseText = words.slice(0, 60).join(' ') + '...';
            // Better: trim to first 2 sentences if too long
            const sentences = responseText.split(/[.!?]\s/);
            if (sentences.length > 2) {
                responseText = sentences.slice(0, 2).join('. ') + '.';
            }
        }

        // Update memory
        memoryManager.addMessage(userId, 'user', userMessage);
        memoryManager.addMessage(userId, 'rk', responseText);
        
        // Background extraction & summary update
        updateMemoryAndSummary(userId, userMessage, responseText).catch(console.error);

        // LOG CONVERSATION
        logger.logMessage({
            userId: userId,
            userName: session.NAME || "Unknown",
            userMessage: userMessage,
            botResponse: responseText,
            phase: session.STAGE || 1,
            interestLevel: session.INTEREST_LEVEL || "Medium",
            sessionId: userId
        });

        return responseText;


    } catch (err) {
        console.error('All APIs failed:', err);
        return "Hey! Sorry, just stepped into a meeting. Catch you in a bit? 🙏";
    }
}

async function updateMemoryAndSummary(userId, userMsg, rkMsg) {
    const session = memoryManager.getOrCreateSession(userId);
    const recentHistory = session.history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
    
    const extractionPrompt = `
    Analyze this conversation and update fields.
    Current: ${JSON.stringify(session)}
    Recent History: ${recentHistory}
    
    Return ONLY JSON with: NAME, PROFESSION, PAIN, GOAL, STAGE, INTEREST_LEVEL, and a 1-sentence SUMMARY of the user's situation.
    `;

    try {
        const result = await groq.chat.completions.create({
            messages: [{ role: 'user', content: extractionPrompt }],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });
        const updates = JSON.parse(result.choices[0].message.content);
        memoryManager.updateSession(userId, updates);
    } catch (e) {
        // Silent failure or retry with Gemini
    }
}

module.exports = { getRkResponse };
