const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const router = express.Router();
const { activeUsers } = require('./activeusers');

//admin login api

// router.post('/login', async (req, res) => {
//   try {
//     const { email, password, role } = req.body;

//     if (!email || !password || !role) {
//       return res.status(400).json({ success: false, message: "Email, password and role are required" });
//     }

//     const [rows] = await db.query("SELECT * FROM users WHERE email = ? AND role = ?", [email, role]);

//     if (rows.length === 0) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const user = rows[0];
//     const isPasswordValid = await bcrypt.compare(password, user.password);

//     if (!isPasswordValid) {
//       return res.status(401).json({ success: false, message: "Invalid password" });
//     }

//     const token = jwt.sign(
//       { userId: user.id, role: user.role, email: user.email, name: user.name },
//       process.env.JWT_SECRET || 'your_jwt_secret',
//       { expiresIn: '1h' }
//     );

//     // Check if user already exists in active list
//     const exists = global.activeUsers.find(u => u.id === user.id);
//     if (!exists) {
//       global.activeUsers.push({
//         id: user.id,
//         email: user.email,
//         role: user.role,
//         loginTime: new Date(),
//         token
//       });
//     }

//     res.status(200).json({
//       success: true,
//       user: { id: user.id, name: user.name, role: user.role },
//       token,
//       message: `Login successful for ${user.name}`
//     });

//   } catch (error) {
//     console.error("Error during login:", error);
//     res.status(500).json({ success: false, message: "Server error", error });
//   }
// });

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '1h' }
    );

    // Check if user already exists in active list
    const exists = global.activeUsers.find(u => u.id === user.id);
    if (!exists) {
      global.activeUsers.push({
        id: user.id,
        email: user.email,
        role: user.role,
        loginTime: new Date(),
        token
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// active users api (students online)

app.get('/active-users', (req, res) => {
  res.json({
    success: true,
    count: global.activeUsers.length,
    users: global.activeUsers
  });
});

//logout api

app.post('/logout', (req, res) => {
  const { id } = req.body; // or extract from token

  global.activeUsers = global.activeUsers.filter(user => user.id !== id);

  res.json({ success: true, message: 'User logged out successfully' });
});


// new account api

router.post('/newacc', async (req, res) => {
  try {
    const { username, email, password, role, class_name } = req.body;

    // ---Validate input
    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    // --- Check if user already exists
    const [existing] = await db.query(`SELECT * FROM users WHERE email = ?`, [email]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User already exists. Try another email!",
      });
    }

    // ---Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ---Insert new user
    const insertQuery = `
      INSERT INTO users (username, email, password, role, class_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(insertQuery, [
      username,
      email,
      hashedPassword,
      role,
      class_name || null, 
    ]);

    // --- Success response
    return res.status(201).json({
      success: true,
      message: `${role} account for ${username} created successfully`,
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


module.exports = router;
