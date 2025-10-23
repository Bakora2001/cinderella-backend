const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const router = express.Router();

// Initialize global activeUsers if not exists
if (!global.activeUsers) {
  global.activeUsers = [];
}

// FIXED: Verify Token Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: 'No authorization header provided' 
    });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'No token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
};

// Login API
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Query database for user
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const user = rows[0];

    // Validate password
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        username: user.username 
      },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '24h' }
    );

    // Add user to active users list
    const existingUserIndex = global.activeUsers.findIndex(u => u.id === user.id);
    
    if (existingUserIndex === -1) {
      global.activeUsers.push({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        loginTime: new Date(),
        token
      });
    } else {
      global.activeUsers[existingUserIndex] = {
        ...global.activeUsers[existingUserIndex],
        loginTime: new Date(),
        token
      };
    }

    console.log(`✅ User logged in: ${user.email} (${user.role})`);
    console.log(`Active users count: ${global.activeUsers.length}`);

    // Send success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        role: user.role,
        class_name: user.class_name || null,
        firstname: user.firstname || null,
        sirname: user.sirname || null
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      error: error.message 
    });
  }
});

// Get Active Users API
router.get('/active-users', (req, res) => {
  try {
    res.status(200).json({
      success: true,
      count: global.activeUsers.length,
      users: global.activeUsers.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        loginTime: user.loginTime
      }))
    });
  } catch (error) {
    console.error('Error fetching active users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Logout API
router.post('/logout', (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    const initialLength = global.activeUsers.length;
    global.activeUsers = global.activeUsers.filter(user => user.id !== id);
    
    const wasRemoved = global.activeUsers.length < initialLength;

    console.log(`User logged out: ${id}`);
    console.log(`Active users count: ${global.activeUsers.length}`);

    res.status(200).json({ 
      success: true, 
      message: 'User logged out successfully',
      wasActive: wasRemoved
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during logout',
      error: error.message 
    });
  }
});

// Create New Account API
router.post('/newacc', async (req, res) => {
  try {
    const { username, email, password, role, class_name } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, email, password, and role are required",
      });
    }

    const validRoles = ['admin', 'teacher', 'student'];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be admin, teacher, or student",
      });
    }

    const [existing] = await db.query(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = `
      INSERT INTO users (username, email, password, role, class_name)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.query(insertQuery, [
      username,
      email,
      hashedPassword,
      role.toLowerCase(),
      class_name || null
    ]);

    console.log(`New user created: ${username} (${role}) - ID: ${result.insertId}`);

    return res.status(201).json({
      success: true,
      message: `Account created successfully`,
      user: {
        id: result.insertId,
        username,
        email,
        role: role.toLowerCase(),
        class_name: class_name || null
      }
    });

  } catch (error) {
    console.error("Error creating account:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating account",
      error: error.message,
    });
  }
});

// Get All Users API
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, email, role, class_name, created_at FROM users ORDER BY created_at DESC'
    );

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get User by ID API
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await db.query(
      'SELECT id, username, email, role, class_name, created_at FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user: users[0]
    });

  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Export router and verifyToken
module.exports = router;
module.exports.verifyToken = verifyToken;