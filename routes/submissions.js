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

// File upload configuration
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png|gif|mp4|avi|mov|wmv|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// ========== STUDENT ROUTES ==========

// 📤 Submit Assignment (Student)
router.post('/submit', verifyToken, upload.single('document'), async (req, res) => {
  try {
    console.log('📤 Student submitting assignment...');
    const { assignmentId, studentId } = req.body;

    if (!assignmentId || !studentId || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID, Student ID, and document are required'
      });
    }

    const documentPath = `/uploads/submissions/${req.file.filename}`;

    // Check if already submitted
    const [existing] = await db.query(
      'SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?',
      [assignmentId, studentId]
    );

    if (existing.length > 0) {
      // Update existing submission
      await db.query(
        `UPDATE submissions 
         SET document_path = ?, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [documentPath, existing[0].id]
      );

      console.log('✅ Assignment resubmitted');
      return res.status(200).json({
        success: true,
        message: 'Assignment resubmitted successfully',
        submission: { id: existing[0].id, assignment_id: assignmentId, student_id: studentId }
      });
    }

    // Create new submission
    const [result] = await db.query(
      `INSERT INTO submissions (assignment_id, student_id, document_path, status, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'submitted', NOW(), NOW(), NOW())`,
      [assignmentId, studentId, documentPath]
    );

    console.log('✅ New submission created with ID:', result.insertId);
    res.status(201).json({
      success: true,
      message: 'Assignment submitted successfully',
      submission: {
        id: result.insertId,
        assignment_id: assignmentId,
        student_id: studentId,
        document_path: documentPath,
        status: 'submitted'
      }
    });
  } catch (error) {
    console.error('❌ Submission error:', error.message);
    if (req.file) fs.unlinkSync(req.file.path).catch(() => {});
    res.status(500).json({ success: false, message: 'Submission failed', error: error.message });
  }
});

// ========== TEACHER ROUTES ==========

// 📚 Get ALL Submissions for Teacher's Assignments (MAIN ROUTE)
router.get('/teacher/:teacher_id/submissions', verifyToken, async (req, res) => {
  try {
    const { teacher_id } = req.params;
    console.log('🔍 Fetching submissions for teacher ID:', teacher_id);

    if (!teacher_id) {
      return res.status(400).json({ success: false, message: 'Teacher ID required' });
    }

    // Simple query: Get all submissions where assignment belongs to this teacher
    const [submissions] = await db.query(
      `SELECT 
        s.id,
        s.assignment_id,
        s.student_id,
        s.document_path,
        s.status,
        s.grade,
        s.feedback,
        s.submitted_at,
        s.created_at,
        s.updated_at,
        a.title as assignment_title,
        a.description as assignment_description,
        a.class_name as assignment_class,
        a.due_date,
        u.username,
        u.email,
        u.class_name as student_class
      FROM submissions s
      INNER JOIN assignments a ON s.assignment_id = a.id
      INNER JOIN users u ON s.student_id = u.id
      WHERE a.teacher_id = ?
      ORDER BY s.submitted_at DESC`,
      [teacher_id]
    );

    console.log(`✅ Found ${submissions.length} submissions`);

    // Transform data
    const transformed = submissions.map(s => ({
      id: s.id,
      assignment_id: s.assignment_id,
      student_id: s.student_id,
      assignment_title: s.assignment_title,
      assignment_description: s.assignment_description,
      assignment_class: s.assignment_class,
      student_name: `${s.firstname || ''} ${s.sirname || ''}`.trim() || s.email,
      student_class: s.student_class,
      student_email: s.email,
      document_path: s.document_path,
      document_url: s.document_path ? `http://localhost:5000${s.document_path}` : null,
      status: s.status,
      grade: s.grade,
      feedback: s.feedback,
      submitted_at: s.submitted_at,
      due_date: s.due_date,
      created_at: s.created_at,
      updated_at: s.updated_at
    }));

    res.status(200).json({
      success: true,
      count: transformed.length,
      submissions: transformed
    });

  } catch (error) {
    console.error('❌ Error fetching teacher submissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions', error: error.message });
  }
});

// 📥 Download Submission Document
router.get('/download/:submission_id', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;

    const [submission] = await db.query(
      'SELECT document_path FROM submissions WHERE id = ?',
      [submission_id]
    );

    if (submission.length === 0 || !submission[0].document_path) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const filePath = path.join(__dirname, '..', submission[0].document_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    const fileName = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
});

// 📊 Get Submissions for Specific Assignment
router.get('/assignment/:assignment_id', verifyToken, async (req, res) => {
  try {
    const { assignment_id } = req.params;

    const [submissions] = await db.query(
      `SELECT 
        s.*,
        u.firstname,
        u.sirname,
        u.email,
        u.class_name as student_class
      FROM submissions s
      INNER JOIN users u ON s.student_id = u.id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC`,
      [assignment_id]
    );

    const transformed = submissions.map(s => ({
      ...s,
      student_name: `${s.firstname || ''} ${s.sirname || ''}`.trim() || s.email,
      document_url: s.document_path ? `http://localhost:5000${s.document_path}` : null
    }));

    res.status(200).json({
      success: true,
      count: transformed.length,
      submissions: transformed
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
  }
});

// ✏️ Grade Submission (Teacher)
router.put('/:submission_id/grade', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;
    const { grade, feedback } = req.body;

    if (!submission_id) {
      return res.status(400).json({ success: false, message: 'Submission ID required' });
    }

    if (grade !== undefined && (grade < 0 || grade > 100)) {
      return res.status(400).json({ success: false, message: 'Grade must be 0-100' });
    }

    await db.query(
      `UPDATE submissions 
       SET grade = ?, feedback = ?, status = 'graded', updated_at = NOW()
       WHERE id = ?`,
      [grade, feedback, submission_id]
    );

    const [updated] = await db.query('SELECT * FROM submissions WHERE id = ?', [submission_id]);

    res.status(200).json({
      success: true,
      message: 'Graded successfully',
      submission: updated[0]
    });

  } catch (error) {
    console.error('❌ Grading error:', error);
    res.status(500).json({ success: false, message: 'Grading failed' });
  }
});

// 🗑️ Delete Submission
router.delete('/:submission_id', verifyToken, async (req, res) => {
  try {
    const { submission_id } = req.params;

    const [submission] = await db.query('SELECT document_path FROM submissions WHERE id = ?', [submission_id]);

    if (submission.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Delete file
    if (submission[0].document_path) {
      const filePath = path.join(__dirname, '..', submission[0].document_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database
    await db.query('DELETE FROM submissions WHERE id = ?', [submission_id]);

    res.status(200).json({ success: true, message: 'Deleted successfully' });

  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

module.exports = router;