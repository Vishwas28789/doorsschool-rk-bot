const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  
  if (!uri || uri === 'placeholder' || 
      uri.includes('<') || uri.includes('>')) {
    console.log('⚠️ MONGODB_URI not valid - skipping database');
    return false;
  }
  
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000
    });
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.error('❌ MongoDB failed:', 
      err.message);
    return false;
  }
};

module.exports = connectDB;
