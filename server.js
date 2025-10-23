// cinderella-backend\server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');

// Import route files
const authRoutes = require('./routes/auth'); 
const userRoutes = require('./routes/users');
const assignmentRoutes = require('./routes/assignments');
const chatbotRoutes = require('./routes/chatbot-free'); // Use free version



dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Routes
app.use('/api', authRoutes);              // Auth routes: /api/login, /api/logout, etc.
app.use('/api/users', userRoutes);        // User routes: /api/users/*
app.use('/api/assignments', assignmentRoutes); // Assignment routes: /api/assignments/*
app.use('/api/chatbot', chatbotRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Cinderella Backend API is running...');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));