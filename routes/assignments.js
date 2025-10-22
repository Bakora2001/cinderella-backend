// cinderella-backend\routes\assignments.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const authRoutes = require('./auth');
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

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png|gif|mp4|avi|mov|wmv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only documents, images, and videos are allowed.'));
    }
  }
});

// 📘 Create New Assignment
router.post('/new', verifyToken, upload.single('document'), async (req, res) => {
  try {
    console.log('Request body:', req.body); 
    console.log('File:', req.file); 

    const { teacherId, title, description, instructions, class_name, due_date } = req.body;
    const teacher_id = teacherId;

    // Validate required fields
    if (!title || !class_name || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Title, class, and due date are required'
      });
    }

    // Validate teacher_id
    if (!teacher_id) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }

    // Handle optional file upload
    const documentPath = req.file ? `/uploads/assignments/${req.file.filename}` : null;

    // Insert into DB
    const [result] = await db.query(
      `INSERT INTO assignments (teacher_id, title, description, instructions, class_name, due_date, document_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [teacher_id, title, description || '', instructions || '', class_name, due_date, documentPath]
    );

    console.log('Insert result:', result); 

    res.status(201).json({
      success: true,
      message: 'Assignment has been created successfully',
      assignment: {
        id: result.insertId,
        teacher_id,
        title,
        description: description || '',
        instructions: instructions || '',
        class_name,
        due_date,
        document_path: documentPath,
        created_at: new Date(),
        updated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error creating assignment:', error.message, error.stack);
    
    // Clean up uploaded file if database insertion fails
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating assignment',
      error: error.message
    });
  }
});
// 📚 Get All Assignments for a Specific Teacher
router.get('/teacher/:teacherId', verifyToken, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { class_name, status } = req.query; // Optional filters

    let query = `
      SELECT 
        id,
        teacher_id,
        title,
        description,
        instructions,
        class_name,
        due_date,
        document_path,
        created_at
      FROM assignments 
      WHERE teacher_id = ?
    `;
    const params = [teacherId];

    // Add optional filters
    if (class_name) {
      query += ` AND class_name = ?`;
      params.push(class_name);
    }

    // Filter by status (upcoming, overdue, all)
    if (status === 'upcoming') {
      query += ` AND due_date >= NOW()`;
    } else if (status === 'overdue') {
      query += ` AND due_date < NOW()`;
    }

    query += ` ORDER BY due_date DESC`;

    const [assignments] = await db.query(query, params);

    res.status(200).json({
      success: true,
      count: assignments.length,
      assignments
    });
  } catch (error) {
    console.error('Error fetching teacher assignments:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching assignments',
      error: error.message
    });
  }
});
// 📖 Get All Assignments for a Specific Student (by class)
router.get('/student/:student_id', verifyToken, async (req, res) => {
  try {
    const { student_id } = req.params;
    const { status } = req.query;

    if (!student_id) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    // First, get the student's class
    const [student] = await db.query(
      `SELECT class_name FROM users WHERE id = ? AND role = 'student'`,
      [student_id]
    );

    if (student.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const studentClass = student[0].class_name;

    if (!studentClass) {
      return res.status(400).json({
        success: false,
        message: 'Student does not have a class assigned'
      });
    }

    // Build query to get assignments for student's class with submission info
    let query = `
      SELECT 
        a.id,
        a.teacher_id,
        a.title,
        a.description,
        a.instructions,
        a.class_name,
        a.due_date,
        a.document_path,
        a.created_at,
        a.updated_at,
        s.id as submission_id,
        s.status as submission_status,
        s.submitted_at,
        s.grade,
        s.feedback
      FROM assignments a
      LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
      WHERE a.class_name = ?
    `;
    const params = [student_id, studentClass];

    // Filter by submission status
    if (status === 'pending') {
      query += ` AND (s.status IS NULL OR s.status = 'pending')`;
    } else if (status === 'submitted') {
      query += ` AND s.status = 'submitted'`;
    } else if (status === 'graded') {
      query += ` AND s.status = 'graded'`;
    }

    query += ` ORDER BY a.due_date DESC`;

    const [assignments] = await db.query(query, params);

    res.status(200).json({
      success: true,
      count: assignments.length,
      class: studentClass,
      assignments
    });
  } catch (error) {
    console.error('Error fetching student assignments:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching assignments',
      error: error.message
    });
  }
});

// 📄 Get Single Assignment by ID
router.get('/:assignment_id', verifyToken, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID is required'
      });
    }

    const [assignment] = await db.query(
      `SELECT 
        id,
        teacher_id,
        title,
        description,
        instructions,
        class_name,
        due_date,
        document_path,
        created_at,
        updated_at
      FROM assignments 
      WHERE id = ?`,
      [assignment_id]
    );

    if (assignment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    res.status(200).json({
      success: true,
      assignment: assignment[0]
    });
  } catch (error) {
    console.error('Error fetching assignment:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching assignment',
      error: error.message
    });
  }
});

// 📊 Get Assignment Statistics for Teacher
router.get('/teacher/:teacher_id/stats', verifyToken, async (req, res) => {
  try {
    const { teacher_id } = req.params;

    if (!teacher_id) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID is required'
      });
    }

    const [stats] = await db.query(
      `SELECT 
        COUNT(*) as total_assignments,
        COUNT(CASE WHEN due_date >= NOW() THEN 1 END) as upcoming,
        COUNT(CASE WHEN due_date < NOW() THEN 1 END) as overdue,
        COUNT(DISTINCT class_name) as total_classes
      FROM assignments 
      WHERE teacher_id = ?`,
      [teacher_id]
    );

    res.status(200).json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error fetching assignment stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stats',
      error: error.message
    });
  }
});

// ✏️ Update Assignment
router.put('/:assignment_id', verifyToken, upload.single('document'), async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { title, description, instructions, class_name, due_date } = req.body;

    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID is required'
      });
    }

    // Check if assignment exists
    const [existing] = await db.query(
      'SELECT * FROM assignments WHERE id = ?',
      [assignment_id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Build update query dynamically
    let updateFields = [];
    let updateValues = [];

    if (title) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (instructions !== undefined) {
      updateFields.push('instructions = ?');
      updateValues.push(instructions);
    }
    if (class_name) {
      updateFields.push('class_name = ?');
      updateValues.push(class_name);
    }
    if (due_date) {
      updateFields.push('due_date = ?');
      updateValues.push(due_date);
    }

    // Handle new file upload
    if (req.file) {
      const documentPath = `/uploads/assignments/${req.file.filename}`;
      updateFields.push('document_path = ?');
      updateValues.push(documentPath);

      // Delete old file if exists
      if (existing[0].document_path) {
        const oldFilePath = path.join(__dirname, '..', existing[0].document_path);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (err) {
            console.error('Error deleting old file:', err);
          }
        }
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Add updated_at timestamp
    updateFields.push('updated_at = NOW()');
    updateValues.push(assignment_id);

    const updateQuery = `UPDATE assignments SET ${updateFields.join(', ')} WHERE id = ?`;
    
    await db.query(updateQuery, updateValues);

    // Fetch updated assignment
    const [updated] = await db.query(
      'SELECT * FROM assignments WHERE id = ?',
      [assignment_id]
    );

    res.status(200).json({
      success: true,
      message: 'Assignment updated successfully',
      assignment: updated[0]
    });
  } catch (error) {
    console.error('Error updating assignment:', error.message);
    
    // Clean up uploaded file if update fails
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating assignment',
      error: error.message
    });
  }
});

// 🗑️ Delete Assignment
router.delete('/:assignment_id', verifyToken, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID is required'
      });
    }

    // Check if assignment exists and get file path
    const [assignment] = await db.query(
      'SELECT * FROM assignments WHERE id = ?',
      [assignment_id]
    );

    if (assignment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Delete associated file if exists
    if (assignment[0].document_path) {
      const filePath = path.join(__dirname, '..', assignment[0].document_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
    }

    // Delete assignment from database
    await db.query('DELETE FROM assignments WHERE id = ?', [assignment_id]);

    res.status(200).json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting assignment:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting assignment',
      error: error.message
    });
  }
});

// 📋 Get All Assignments (Admin/Overview)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { class_name, teacher_id, status, limit, offset } = req.query;

    let query = `
      SELECT 
        a.*,
        u.firstname as teacher_firstname,
        u.sirname as teacher_surname
      FROM assignments a
      LEFT JOIN users u ON a.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Add filters
    if (class_name) {
      query += ` AND a.class_name = ?`;
      params.push(class_name);
    }
    if (teacher_id) {
      query += ` AND a.teacher_id = ?`;
      params.push(teacher_id);
    }
    if (status === 'upcoming') {
      query += ` AND a.due_date >= NOW()`;
    } else if (status === 'overdue') {
      query += ` AND a.due_date < NOW()`;
    }

    query += ` ORDER BY a.created_at DESC`;

    // Add pagination
    if (limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(limit));
    }
    if (offset) {
      query += ` OFFSET ?`;
      params.push(parseInt(offset));
    }

    const [assignments] = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM assignments WHERE 1=1';
    const countParams = [];
    if (class_name) {
      countQuery += ` AND class_name = ?`;
      countParams.push(class_name);
    }
    if (teacher_id) {
      countQuery += ` AND teacher_id = ?`;
      countParams.push(teacher_id);
    }
    if (status === 'upcoming') {
      countQuery += ` AND due_date >= NOW()`;
    } else if (status === 'overdue') {
      countQuery += ` AND due_date < NOW()`;
    }

    const [countResult] = await db.query(countQuery, countParams);

    res.status(200).json({
      success: true,
      count: assignments.length,
      total: countResult[0].total,
      assignments
    });
  } catch (error) {
    console.error('Error fetching all assignments:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching assignments',
      error: error.message
    });
  }
});

module.exports = router;

module.exports = router;
