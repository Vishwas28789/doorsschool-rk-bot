const Knowledge = require('./models/Knowledge');

async function addEntry(tag, content) {
  return await Knowledge.create({ tag, content, 
    status: 'staging' });
}

async function getEntries(status) {
  const query = status ? { status } : {};
  return await Knowledge.find(query)
    .sort({ createdAt: -1 });
}

async function deployEntry(id) {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid ID format');
  }
  return await Knowledge.findByIdAndUpdate(
    id, { status: 'live' }, { new: true }
  );
}

async function deleteEntry(id) {
  return await Knowledge.findByIdAndDelete(id);
}

async function getLiveContext() {
  const entries = await Knowledge.find(
    { status: 'live' }
  );
  if (!entries.length) return '';
  return entries.map(e => 
    `[${e.tag}]: ${e.content}`
  ).join('\n');
}

module.exports = { 
  addEntry, getEntries, deployEntry, 
  deleteEntry, getLiveContext 
};
