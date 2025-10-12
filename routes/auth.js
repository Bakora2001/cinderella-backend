const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const router = express.Router();

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

module.exports = router;
