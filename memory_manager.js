const mongoose = require('mongoose');
const SessionModel = require('./models/Session');

function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

class MemoryManager {
  constructor() {
    this.localSessions = new Map();
  }

  async getSession(userId) {
    if (!isDBConnected()) {
      if (!this.localSessions.has(userId)) {
        this.localSessions.set(userId, { 
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
      return this.localSessions.get(userId);
    }

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
    if (!isDBConnected()) {
      const session = await this.getSession(userId);
      Object.assign(session, updates);
      return session;
    }

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
    if (!isDBConnected()) {
      const session = await this.getSession(userId);
      session.history.push({ role: role === 'rk' ? 'assistant' : role, content, timestamp: new Date() });
      if (session.history.length > 6) session.history = session.history.slice(-6);
      return session;
    }

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
    if (!isDBConnected()) {
      const session = await this.getSession(userId);
      return session.history.slice(-6).map(h => ({
        role: h.role === 'assistant' ? 'rk' : h.role,
        content: h.content
      }));
    }

    const session = await SessionModel.findOne({ userId });
    if (!session) return [];
    return session.history.slice(-6).map(h => ({
      role: h.role === 'assistant' ? 'rk' : h.role,
      content: h.content
    }));
  }

  async getCompressedContext(userId) {
    const session = await this.getSession(userId);
    const history = !isDBConnected() ? session.history : session.history.toObject();
    
    return {
      summary: session.summary || "New user.",
      recentMessages: history.slice(-4).map(h => ({
        role: h.role === 'assistant' ? 'rk' : h.role,
        content: h.content
      })),
      stage: session.stage,
      interestLevel: session.interestLevel,
      name: session.name
    };
  }

  async clearSession(userId) {
    if (!isDBConnected()) {
      this.localSessions.delete(userId);
      return;
    }

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
    if (!isDBConnected()) {
      return Array.from(this.localSessions.values());
    }
    return await SessionModel.find().sort({ lastActive: -1 });
  }

  async getOrCreateSession(userId) {
    const session = await this.getSession(userId);
    const sessionObj = !isDBConnected() ? session : session.toObject();
    
    return {
        ...sessionObj,
        NAME: sessionObj.name,
        PROFESSION: sessionObj.profession,
        PAIN: sessionObj.pain,
        GOAL: sessionObj.goal,
        STAGE: sessionObj.stage,
        INTEREST_LEVEL: sessionObj.interestLevel
    };
  }

  async addMessage(userId, role, content) {
    return await this.addToHistory(userId, role, content);
  }
}

module.exports = new MemoryManager();
