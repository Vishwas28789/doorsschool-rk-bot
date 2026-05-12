const SessionModel = require('./models/Session');

class MemoryManager {
  async getSession(userId) {
    let session = await SessionModel.findOne({ userId });
    if (!session) {
      session = await SessionModel.create({ 
        userId,
        name: 'Unknown',
        profession: 'Unknown',
        pain: 'Unknown',
        goal: 'Unknown',
        stage: 1,
        interestLevel: 'low',
        history: []
      });
    }
    return session;
  }

  async updateSession(userId, updates) {
    // Map old field names to new if necessary, or just use updates
    // The model uses lowercase fields: name, profession, pain, goal, stage, interestLevel
    const mappedUpdates = {};
    if (updates.NAME) mappedUpdates.name = updates.NAME;
    if (updates.PROFESSION) mappedUpdates.profession = updates.PROFESSION;
    if (updates.PAIN) mappedUpdates.pain = updates.PAIN;
    if (updates.GOAL) mappedUpdates.goal = updates.GOAL;
    if (updates.STAGE) mappedUpdates.stage = typeof updates.STAGE === 'number' ? updates.STAGE : 1;
    if (updates.INTEREST_LEVEL) mappedUpdates.interestLevel = updates.INTEREST_LEVEL;
    
    const finalUpdates = { ...updates, ...mappedUpdates, lastActive: new Date() };

    return await SessionModel.findOneAndUpdate(
      { userId },
      finalUpdates,
      { new: true, upsert: true }
    );
  }

  async addToHistory(userId, role, content) {
    // Map 'rk' role to 'assistant' for the model
    const mappedRole = role === 'rk' ? 'assistant' : role;
    
    return await SessionModel.findOneAndUpdate(
      { userId },
      { 
        $push: { 
          history: { role: mappedRole, content } 
        },
        lastActive: new Date()
      },
      { upsert: true, new: true }
    );
  }

  async getHistory(userId) {
    const session = await SessionModel.findOne({ userId });
    if (!session) return [];
    return session.history.slice(-6).map(h => ({
      role: h.role === 'assistant' ? 'rk' : h.role, // Map back for logic compatibility
      content: h.content
    }));
  }

  async getCompressedContext(userId) {
    const session = await this.getSession(userId);
    return {
      summary: session.summary || "New user.",
      recentMessages: session.history.slice(-4).map(h => ({
        role: h.role === 'assistant' ? 'rk' : h.role,
        content: h.content
      })),
      stage: session.stage,
      interestLevel: session.interestLevel,
      name: session.name
    };
  }

  async clearSession(userId) {
    return await SessionModel.findOneAndUpdate(
      { userId },
      { 
        history: [],
        stage: 1,
        interestLevel: 'low'
      }
    );
  }

  async getAllSessions() {
    return await SessionModel.find().sort({ lastActive: -1 });
  }

  // Support for methods used in bot_logic.js
  async getOrCreateSession(userId) {
    const session = await this.getSession(userId);
    // Return with uppercase keys for compatibility with bot_logic.js if needed
    return {
        ...session.toObject(),
        NAME: session.name,
        PROFESSION: session.profession,
        PAIN: session.pain,
        GOAL: session.goal,
        STAGE: session.stage,
        INTEREST_LEVEL: session.interestLevel
    };
  }

  async addMessage(userId, role, content) {
    return await this.addToHistory(userId, role, content);
  }
}

module.exports = new MemoryManager();
