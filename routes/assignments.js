const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const authRoutes = require('./auth'); // Destructure verifyToken
const router = express.Router();
const verifyToken = authRoutes.verifyToken;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/assignments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// 📘 Create New Assignment
router.post('/new', verifyToken, upload.single('document'), async (req, res) => {
  try {
    console.log('Request body:', req.body); 
    console.log('File:', req.file); 

    const { teacherId, title, description, instructions, class_name, due_date} = req.body;
    const teacher_id = teacherId;
    // Validate required fields
    if (!title || !class_name || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Title, class, and due date are required'
      });
    }

    // Handle optional file upload
    const documentPath = req.file ? `/uploads/${req.file.filename}` : null;

    // Insert into DB
    const [result] = await db.query(
      `INSERT INTO assignments (teacher_id, title, description, instructions, class_name, due_date, document_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [teacher_id, title, description, instructions, class_name, due_date, documentPath]
    );

    console.log('Insert result:', result); 

    res.status(201).json({
      success: true,
      message: 'Assignment has been created successfully',
      assignment: {
        id: result.insertId,
        teacher_id,
        title,
        description,
        instructions,
        class_name,
        due_date,
        document_path: documentPath,
      }
    });
  } catch (error) {
    console.error('Error creating assignment:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error while creating assignment',
      error: error.message
    });
  }
});

// Get Assignments for a Specific Teacher
router.get('/teacher/:teacher_id', verifyToken, async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required',
      });
    }

    // Query the DB for assignments created by this teacher
    const [rows] = await db.query(
      'SELECT * FROM assignments WHERE teacher_id = ? ORDER BY created_at DESC',
      [teacherId]
    );

    res.status(200).json({
      success: true,
      count: rows.length,
      assignments: rows,
    });
  } catch (error) {
    console.error('Error fetching assignments for teacher:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching assignments',
      error: error.message,
    });
  }
});


module.exports = router;