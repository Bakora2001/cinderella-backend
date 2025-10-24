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

console.log('✅ All route files imported successfully');

// Routes
app.use('/api', authRoutes);              // Auth routes: /api/login, /api/logout, etc.
app.use('/api/users', userRoutes);        // User routes: /api/users/*
app.use('/api/assignments', assignmentRoutes); // Assignment routes: /api/assignments/*
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/submissions', submissionsRoutes);

console.log('✅ All routes mounted');
console.log('📍 Submissions routes available at: /api/submissions/*');

// Test endpoint to verify submissions routes
app.get('/api/test-submissions', (req, res) => {
  res.json({ 
    message: 'Submissions routes are working!',
    availableRoutes: [
      'POST /api/submissions/submit',
      'GET /api/submissions/teacher/:teacher_id/submissions',
      'GET /api/submissions/download/:submission_id',
      'GET /api/submissions/student/:student_id',
      'GET /api/submissions/assignment/:assignment_id',
      'GET /api/submissions/:submission_id',
      'PUT /api/submissions/:submission_id/grade',
      'PUT /api/submissions/:submission_id/status',
      'DELETE /api/submissions/:submission_id'
    ]
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Cinderella Backend API is running...');
});

// 404 handler - should be LAST
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    success: false, 
    message: `Route not found: ${req.method} ${req.path}`,
    hint: 'Check if the route is properly defined and the server has been restarted'
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('📋 Available route prefixes:');
  console.log('   - /api (auth routes)');
  console.log('   - /api/users');
  console.log('   - /api/assignments');
  console.log('   - /api/chatbot');
  console.log('   - /api/submissions');
  console.log('\n🔍 Test submissions endpoint: http://localhost:' + PORT + '/api/test-submissions');
});