const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../config/db');
const router = express.Router();

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/assignments'); // make sure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// 📘 Create New Assignment
router.post('/new', upload.single('document'), async (req, res) => {
  try {
    const { title, description, instructions, class_name, due_date } = req.body;

    // Validate required fields
    if (!title || !class_name || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Title, class, and due date are required'
      });
    }

    // Handle optional file upload
    const documentPath = req.file ? req.file.path : null;

    // Insert into DB
    const [result] = await db.query(
      `INSERT INTO assignments (title, description, instructions, class_name, due_date, document_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, instructions, class_name, due_date, documentPath]
    );

    console.log('Insert result:', result);

    res.status(201).json({
      success: true,
      message: 'Assignment has been created successfully',
      assignment: {
        id: result.insertId,
        title,
        description,
        instructions,
        class_name,
        due_date,
        document_path: documentPath
      }

    });

  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating assignment',
      error: error.message
    });
  }
});

module.exports = router;
