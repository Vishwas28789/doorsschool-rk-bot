const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  
  if (!uri || uri === 'placeholder' || 
      uri.includes('<') || uri.includes('>')) {
    console.log('⚠️ Invalid or missing MONGODB_URI - skipping database');
    return false;
  }
  
  if (!uri.startsWith('mongodb')) {
    console.log('⚠️ MONGODB_URI format wrong:', 
      uri.substring(0,20));
    return false;
  }
  
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.error('❌ MongoDB error:', 
      err.message);
    return false;
  }
};

module.exports = connectDB;
