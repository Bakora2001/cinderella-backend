// cinderella-backend\routes\submissions.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const authRoutes = require('./auth');
const router = express.Router();
const verifyToken = authRoutes.verifyToken;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/submissions');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File upload setup for submissions
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
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png|gif|mp4|avi|mov|wmv|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only documents, images, videos, and archives are allowed.'));
    }
  }
});

// 📤 Submit Assignment (Student)
router.post('/submit', verifyToken, upload.single('document'), async (req, res) => {
  try {
    console.log('Submission request body:', req.body);
    console.log('Submission file:', req.file);

    const { assignmentId, studentId } = req.body;

    // Validate required fields
    if (!assignmentId || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID and Student ID are required'
      });
    }

    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a document'
      });
    }

    // Check if assignment exists
    const [assignment] = await db.query(
      'SELECT * FROM assignments WHERE id = ?',
      [assignmentId]
    );

    if (assignment.length === 0) {
      // Clean up uploaded file
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Check if student has already submitted
    const [existingSubmission] = await db.query(
      'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?',
      [assignmentId, studentId]
    );

    const documentPath = `/uploads/submissions/${req.file.filename}`;

    if (existingSubmission.length > 0) {
      // Update existing submission
      // Delete old file if exists
      if (existingSubmission[0].document_path) {
        const oldFilePath = path.join(__dirname, '..', existingSubmission[0].document_path);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (err) {
            console.error('Error deleting old file:', err);
          }
        }
      }

      await db.query(
        `UPDATE submissions 
         SET document_path = ?, submitted_at = NOW(), status = 'submitted', updated_at = NOW()
         WHERE id = ?`,
        [documentPath, existingSubmission[0].id]
      );

      res.status(200).json({
        success: true,
        message: 'Assignment resubmitted successfully',
        submission: {
          id: existingSubmission[0].id,
          assignment_id: assignmentId,
          student_id: studentId,
          document_path: documentPath,
          status: 'submitted',
          submitted_at: new Date(),
          updated_at: new Date()
        }
      });
    } else {
      // Create new submission
      const [result] = await db.query(
        `INSERT INTO submissions (assignment_id, student_id, document_path, status, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, 'submitted', NOW(), NOW(), NOW())`,
        [assignmentId, studentId, documentPath]
      );

      res.status(201).json({
        success: true,
        message: 'Assignment submitted successfully',
        submission: {
          id: result.insertId,
          assignment_id: assignmentId,
          student_id: studentId,
          document_path: documentPath,
          status: 'submitted',
          submitted_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    }
  } catch (error) {
    console.error('Error submitting assignment:', error.message, error.stack);
    
    // Clean up uploaded file if submission fails
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while submitting assignment',
      error: error.message
    });
  }
});

// 📚 Get All Submissions for a Student
router.get('/student/:student_id', verifyToken, async (req, res) => {
  try {
    const { student_id } = req.params;

    if (!student_id) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    const [submissions] = await db.query(
      `SELECT 
        s.*,
        a.title as assignment_title,
        a.description as assignment_description,
        a.due_date,
        a.class_name
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE s.student_id = ?
      ORDER BY s.submitted_at DESC`,
      [student_id]
    );

    res.status(200).json({
      success: true,
      count: submissions.length,
      submissions
    });
  } catch (error) {
    console.error('Error fetching student submissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions',
      error: error.message
    });
  }
});

// 📖 Get All Submissions for an Assignment
router.get('/assignment/:assignment_id', verifyToken, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID is required'
      });
    }

    const [submissions] = await db.query(
      `SELECT 
        s.*,
        u.firstname,
        u.sirname,
        u.email,
        u.class as student_class
      FROM submissions s
      JOIN users u ON s.student_id = u.id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC`,
      [assignment_id]
    );

    res.status(200).json({
      success: true,
      count: submissions.length,
      submissions
    });
  } catch (error) {
    console.error('Error fetching assignment submissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions',
      error: error.message
    });
  }
});

// 📄 Get Single Submission by ID
router.get('/:submission_id', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }

    const [submission] = await db.query(
      `SELECT 
        s.*,
        a.title as assignment_title,
        a.description as assignment_description,
        a.due_date,
        u.firstname,
        u.sirname,
        u.email
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      JOIN users u ON s.student_id = u.id
      WHERE s.id = ?`,
      [submission_id]
    );

    if (submission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    res.status(200).json({
      success: true,
      submission: submission[0]
    });
  } catch (error) {
    console.error('Error fetching submission:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submission',
      error: error.message
    });
  }
});

// ✏️ Grade Submission (Teacher)
router.put('/:submission_id/grade', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;
    const { grade, feedback } = req.body;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }

    // Validate grade
    if (grade !== undefined && (grade < 0 || grade > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Grade must be between 0 and 100'
      });
    }

    // Check if submission exists
    const [existing] = await db.query(
      'SELECT * FROM submissions WHERE id = ?',
      [submission_id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Update submission with grade and feedback
    await db.query(
      `UPDATE submissions 
       SET grade = ?, feedback = ?, status = 'graded', updated_at = NOW()
       WHERE id = ?`,
      [grade, feedback, submission_id]
    );

    // Fetch updated submission
    const [updated] = await db.query(
      'SELECT * FROM submissions WHERE id = ?',
      [submission_id]
    );

    res.status(200).json({
      success: true,
      message: 'Submission graded successfully',
      submission: updated[0]
    });
  } catch (error) {
    console.error('Error grading submission:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while grading submission',
      error: error.message
    });
  }
});

// 📝 Update Submission Status (Teacher)
router.put('/:submission_id/status', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;
    const { status } = req.body;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }

    // Validate status
    const validStatuses = ['submitted', 'reviewed', 'graded', 'returned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: submitted, reviewed, graded, or returned'
      });
    }

    // Check if submission exists
    const [existing] = await db.query(
      'SELECT * FROM submissions WHERE id = ?',
      [submission_id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Update submission status
    await db.query(
      'UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, submission_id]
    );

    // Fetch updated submission
    const [updated] = await db.query(
      'SELECT * FROM submissions WHERE id = ?',
      [submission_id]
    );

    res.status(200).json({
      success: true,
      message: 'Submission status updated successfully',
      submission: updated[0]
    });
  } catch (error) {
    console.error('Error updating submission status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while updating submission status',
      error: error.message
    });
  }
});

// 🗑️ Delete Submission
router.delete('/:submission_id', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }

    // Check if submission exists and get file path
    const [submission] = await db.query(
      'SELECT * FROM submissions WHERE id = ?',
      [submission_id]
    );

    if (submission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Delete associated file if exists
    if (submission[0].document_path) {
      const filePath = path.join(__dirname, '..', submission[0].document_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
    }

    // Delete submission from database
    await db.query('DELETE FROM submissions WHERE id = ?', [submission_id]);

    res.status(200).json({
      success: true,
      message: 'Submission deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting submission:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting submission',
      error: error.message
    });
  }
});

// 📊 Get Submission Statistics for Teacher
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
        COUNT(DISTINCT s.id) as total_submissions,
        COUNT(DISTINCT CASE WHEN s.status = 'submitted' THEN s.id END) as pending_review,
        COUNT(DISTINCT CASE WHEN s.status = 'graded' THEN s.id END) as graded,
        AVG(s.grade) as average_grade,
        COUNT(DISTINCT s.student_id) as unique_students
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE a.teacher_id = ?`,
      [teacher_id]
    );

    res.status(200).json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error fetching submission stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stats',
      error: error.message
    });
  }
});

// 📋 Get All Submissions (Admin/Overview)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, class_name, limit, offset } = req.query;

    let query = `
      SELECT 
        s.*,
        a.title as assignment_title,
        a.class_name,
        u.firstname,
        u.sirname,
        u.email
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      JOIN users u ON s.student_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Add filters
    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }
    if (class_name) {
      query += ` AND a.class_name = ?`;
      params.push(class_name);
    }

    query += ` ORDER BY s.submitted_at DESC`;

    // Add pagination
    if (limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(limit));
    }
    if (offset) {
      query += ` OFFSET ?`;
      params.push(parseInt(offset));
    }

    const [submissions] = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE 1=1
    `;
    const countParams = [];
    if (status) {
      countQuery += ` AND s.status = ?`;
      countParams.push(status);
    }
    if (class_name) {
      countQuery += ` AND a.class_name = ?`;
      countParams.push(class_name);
    }

    const [countResult] = await db.query(countQuery, countParams);

    res.status(200).json({
      success: true,
      count: submissions.length,
      total: countResult[0].total,
      submissions
    });
  } catch (error) {
    console.error('Error fetching all submissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching submissions',
      error: error.message
    });
  }
});


module.exports = router;