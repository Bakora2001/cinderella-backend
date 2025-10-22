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

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Cinderella Backend API is running...');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));





