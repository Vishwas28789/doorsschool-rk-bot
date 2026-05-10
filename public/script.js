const socket = io();

const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');

// Handle message history on load
socket.on('history', (history) => {
    messageArea.innerHTML = '';
    history.forEach(msg => {
        addMessage(msg.content, msg.role === 'user' ? 'user' : 'rk', '12:00 PM'); // Simplified timestamp for history
    });
    scrollToBottom();
});

// Handle incoming Rk response
socket.on('rk_response', (data) => {
    addMessage(data.content, 'rk', data.timestamp);
    scrollToBottom();
});

// Handle typing status
socket.on('typing', (isTyping) => {
    if (isTyping) {
        typingIndicator.classList.add('active');
    } else {
        typingIndicator.classList.remove('active');
    }
    scrollToBottom();
});

// Send message function
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        addMessage(text, 'user', timestamp);
        socket.emit('message', text);
        messageInput.value = '';
        scrollToBottom();
    }
}

// Add message to UI
function addMessage(text, sender, time) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    const content = `
        <div class="message-text">${text}</div>
        <div class="message-meta">
            ${time}
            ${sender === 'user' ? '<i class="fas fa-check-double"></i>' : ''}
        </div>
    `;
    
    messageDiv.innerHTML = content;
    messageArea.appendChild(messageDiv);
}

function scrollToBottom() {
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Handle reset button
const newChatBtn = document.getElementById('newChatBtn');
newChatBtn.addEventListener('click', async () => {
    if (confirm('Start a new conversation? All history will be cleared.')) {
        try {
            // 1. Clear UI messages immediately
            messageArea.innerHTML = '';
            
            // 2. Call reset endpoint
            await fetch('/reset', { method: 'POST' });
            
            // 3. Show typing indicator
            typingIndicator.classList.add('active');
            scrollToBottom();
            
            // 4. After 1.5 seconds show fresh greeting
            setTimeout(() => {
                typingIndicator.classList.remove('active');
                const greeting = "Hey, glad you reached out. I'm Rk — started Doorsschool after watching too many sharp people stay broke because nobody taught them how to actually sell or build a real business system. What's the one thing holding you back right now — income, clients, skills, or just feeling stuck?";
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                addMessage(greeting, 'rk', timestamp);
                scrollToBottom();
            }, 1500);

        } catch (error) {
            console.error('Reset failed:', error);
        }
    }
});
