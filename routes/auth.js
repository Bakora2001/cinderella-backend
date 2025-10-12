const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const router = express.Router();

//admin login api

router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ success: false, message: "Email, password and role are required" });
    }

    const [rows] = await db.query("SELECT * FROM users WHERE email = ? AND role = ?", [email, role]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      user: { id: user.id, name: user.name, role: user.role },
      token,
      message: `Login successful for ${user.name}`
    });

  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
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
