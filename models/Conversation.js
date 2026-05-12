const mongoose = require('mongoose');
const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Unknown' },
  userMessage: String,
  botResponse: String,
  phase: { type: Number, default: 1 },
  interestLevel: { 
    type: String, 
    default: 'low',
    enum: ['low','medium','high','ready']
  },
  sessionId: String,
  timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model(
  'Conversation', ConversationSchema
);
