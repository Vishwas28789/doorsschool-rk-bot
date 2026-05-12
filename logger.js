const Conversation = require('./models/Conversation');

async function logMessage(data) {
  try {
    await Conversation.create(data);
  } catch(err) {
    console.error('Log error:', err);
  }
}

async function getConversations() {
  return await Conversation.find()
    .sort({ timestamp: -1 })
    .limit(100);
}

async function getStats() {
  const total = await Conversation.distinct('userId');
  const today = new Date();
  today.setHours(0,0,0,0);
  const activeToday = await Conversation.distinct(
    'userId', { timestamp: { $gte: today } }
  );
  const webinarLink = process.env.WEBINAR_LINK || '';
  const signups = await Conversation.countDocuments({
    botResponse: { $regex: webinarLink, $options: 'i' }
  });
  const convRate = total.length > 0 
    ? ((signups / total.length) * 100).toFixed(1) 
    : '0';
  return {
    totalConversations: total.length,
    activeToday: activeToday.length,
    webinarSignups: signups,
    conversionRate: convRate + '%'
  };
}

module.exports = { logMessage, getConversations, getStats };
