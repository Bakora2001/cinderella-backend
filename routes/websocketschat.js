// routes/chat.js
const express = require('express');
const db = require('../config/db');
const router = express.Router();

// Get user's conversations
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [conversations] = await db.query(
      `SELECT 
        u.id as userId,
        u.username,
        u.role,
        u.email,
        MAX(m.timestamp) as lastMessageTime,
        (SELECT message FROM messages WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?) ORDER BY timestamp DESC LIMIT 1) as lastMessage
       FROM users u
       INNER JOIN messages m ON (m.sender_id = u.id OR m.receiver_id = u.id)
       WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
       GROUP BY u.id
       ORDER BY lastMessageTime DESC`,
      [userId, userId, userId, userId, userId]
    );

    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get users available for chat (excluding students for students)
router.get('/available-users/:userId/:role', async (req, res) => {
  try {
    const { userId, role } = req.params;
    let query = 'SELECT id, username, email, role, class_name FROM users WHERE id != ?';
    
    // Students cannot see other students
    if (role === 'student') {
      query += ' AND role != "student"';
    }

    const [users] = await db.query(query, [userId]);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching available users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;