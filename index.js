const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { getRkResponse } = require('./bot_logic');
require('dotenv').config();

// Create WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(), // Saves session locally to avoid re-scanning
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

// QR Code handling
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP APP:');
    qrcode.generate(qr, { small: true });
});

// Ready event
client.on('ready', () => {
    console.log('Rk is online and ready to chat! 🚀');
});

// Message handling
client.on('message', async (msg) => {
    // Ignore messages from groups or status updates
    if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') {
        return;
    }

    console.log(`Message from ${msg.from}: ${msg.body}`);

    try {
        // Show typing indicator
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        // Get Rk's response
        const response = await getRkResponse(msg.from, msg.body);

        // Small delay to feel more human
        setTimeout(async () => {
            await client.sendMessage(msg.from, response);
            console.log(`Rk responded to ${msg.from}`);
        }, 1500);

    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Error handling
client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

// Initialize Client
console.log('Starting Rk Bot...');
client.initialize();
