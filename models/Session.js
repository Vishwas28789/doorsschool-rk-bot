const mongoose = require('mongoose');
const SessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: String,
  profession: String,
  pain: String,
  goal: String,
  stage: { type: Number, default: 1 },
  interestLevel: { 
    type: String, 
    default: 'low' 
  },
  history: [{
    role: { type: String, enum: ['user','assistant'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model(
  'Session', SessionSchema
);
