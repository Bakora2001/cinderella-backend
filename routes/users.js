const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all users
router.get('/getallusers', async (req, res) => {
  try {
    // Fetch all users from MySQL
    const [rows] = await db.query(
      'SELECT id, firstname, sirname, email, role, class FROM users ORDER BY id DESC'
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No users found' });
    }

    res.status(200).json({
      success: true,
      count: rows.length,
      users: rows
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error
    });
  }
});

// ✅ UPDATE user info
router.put('/edituserdata:id', async (req, res) => {
  const { id } = req.params;
  const { firstname, sirname, email, role, class: studentClass } = req.body;

  try {
    // Check if user exists
    const [existingUser] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (existingUser.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update user info
    await db.query(
      `UPDATE users 
       SET firstname = ?, sirname = ?, email = ?, role = ?, class = ? 
       WHERE id = ?`,
      [firstname, sirname, email, role, studentClass || null, id]
    );

    res.status(200).json({
      success: true,
      message: 'User information updated successfully ✅'
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user info',
      error
    });
  }
});

//deketing user api (incase of problems change router name like /api/uers...)

router.delete('deleteuser/:id', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body; // We'll check the role of the logged-in user

  try {
    // 1️⃣ Check if the requester is an admin
    if (role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized: Only admins can delete users' 
      });
    }

    // 2️⃣ Prevent accidental self-deletion (optional)
    if (req.user && req.user.id == id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    // 3️⃣ Delete the user
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting user' 
    });
  }
});



module.exports = router;
