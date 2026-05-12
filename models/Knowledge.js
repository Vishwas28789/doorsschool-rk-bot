const mongoose = require('mongoose');
const KnowledgeSchema = new mongoose.Schema({
  tag: { 
    type: String, 
    enum: ['Course','Webinar','Offer','Update','Other'],
    default: 'Update'
  },
  content: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['staging','live'],
    default: 'staging'
  },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model(
  'Knowledge', KnowledgeSchema
);
