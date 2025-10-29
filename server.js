// cinderella-backend\server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Debug middleware - logs all requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Import route files
const authRoutes = require('./routes/auth'); 
const userRoutes = require('./routes/users');
const assignmentRoutes = require('./routes/assignments');
const chatbotRoutes = require('./routes/chatbot-free'); // Use free version
const submissionsRoutes = require('./routes/submissions');

// Routes
app.use('/api/users', userRoutes);        // FIRST: /api/users/*
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api', authRoutes); 

// Default route
app.get('/', (req, res) => {
  res.send('Cinderella Backend API is running...');
});

// 404 handler - should be LAST
app.use((req, res) => {
  // console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    success: false, 
    message: `Route not found: ${req.method} ${req.path}`,
    hint: 'Check if the route is properly defined and the server has been restarted'
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  // console.log(`✅ Server running on port ${PORT}`);
  // console.log('📋 Available route prefixes:');
  // console.log('   - /api (auth routes)');
  // console.log('   - /api/users');
  // console.log('   - /api/assignments');
  // console.log('   - /api/chatbot');
  // console.log('   - /api/submissions');
  // console.log('\n🔍 Test submissions endpoint: http://localhost:' + PORT + '/api/test-submissions');
});