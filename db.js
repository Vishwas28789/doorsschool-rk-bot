const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.log('WARNING: MONGODB_URI not found in environment variables');
    console.log('Available env vars:', 
      Object.keys(process.env).filter(k => 
        !k.includes('npm') && !k.includes('NODE')
      ).join(', '));
    return;
  }
  
  console.log('Attempting MongoDB connection...');
  console.log('URI starts with:', uri.substring(0,30));
  
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection FAILED:', err.message);
    throw err;
  }
};

module.exports = connectDB;
