const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authModule = require('./auth');
const verifyToken = authModule.verifyToken;

// Using HuggingFace's free inference API
const HF_API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2';

// System prompt for educational assistant
const SYSTEM_PROMPT = `You are a helpful and friendly academic tutor. Help students understand concepts, guide them through problems, and encourage learning. Give direct answers to homework. Keep responses clear, concise, and educational.`;

// 💬 Chat with FREE AI
router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { message, studentId, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get student info
    const [student] = await db.query(
      'SELECT username, firstname, sirname, class_name FROM users WHERE id = ?',
      [studentId || req.user.id]
    );

    const studentName = student.length > 0 
      ? (student[0].firstname ? `${student[0].firstname} ${student[0].sirname}` : student[0].username)
      : 'Student';

    // Build conversation context
    let conversationContext = '';
    if (conversationHistory.length > 0) {
      conversationContext = conversationHistory.slice(-4).map(msg => 
        `${msg.role === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`
      ).join('\n');
    }

    // Create educational prompt
    const prompt = `${SYSTEM_PROMPT}

${conversationContext ? 'Previous conversation:\n' + conversationContext + '\n\n' : ''}Student ${studentName}: ${message}

Tutor:`;

    console.log('🤖 Sending request to AI...');

    // Call Hugging Face FREE API
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.7,
          top_p: 0.95,
          return_full_text: false,
          repetition_penalty: 1.2
        }
      })
    });

    let aiResponse = '';

    if (!response.ok) {
      console.log('⚠️ AI API unavailable, using fallback');
      aiResponse = generateFallbackResponse(message);
    } else {
      const data = await response.json();
      
      if (Array.isArray(data) && data[0]?.generated_text) {
        aiResponse = data[0].generated_text.trim();
      } else if (data.generated_text) {
        aiResponse = data.generated_text.trim();
      } else if (data.error) {
        console.log('⚠️ AI error:', data.error);
        aiResponse = generateFallbackResponse(message);
      } else {
        aiResponse = generateFallbackResponse(message);
      }
    }

    // Clean up response
    aiResponse = aiResponse
      .replace(prompt, '')
      .replace(/^(Tutor:|Assistant:)/i, '')
      .trim();

    // Limit response length
    if (aiResponse.length > 500) {
      aiResponse = aiResponse.substring(0, 500) + '...';
    }

    // Save to database
    try {
      await db.query(
        `INSERT INTO chat_history (student_id, user_message, ai_response, created_at)
         VALUES (?, ?, ?, NOW())`,
        [studentId || req.user.id, message, aiResponse]
      );
    } catch (dbError) {
      console.error('Database save error:', dbError);
      // Continue even if DB save fails
    }

    console.log('✅ AI response generated successfully');

    res.status(200).json({
      success: true,
      response: aiResponse,
      model: 'mistral-7b-free'
    });

  } catch (error) {
    console.error('❌ Error in AI chat:', error);
    
    const fallbackResponse = generateFallbackResponse(req.body.message);
    
    res.status(200).json({
      success: true,
      response: fallbackResponse,
      model: 'fallback'
    });
  }
});

// 📜 Get Chat History
router.get('/history/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { limit = 50 } = req.query;

    // Verify user can only access their own history (unless admin)
    if (req.user.id !== parseInt(studentId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const [history] = await db.query(
      `SELECT * FROM chat_history 
       WHERE student_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [studentId, parseInt(limit)]
    );

    res.status(200).json({
      success: true,
      count: history.length,
      history: history.reverse()
    });

  } catch (error) {
    console.error('Error fetching chat history:', error);
    
    // If table doesn't exist, return empty history instead of error
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(200).json({
        success: true,
        count: 0,
        history: [],
        note: 'Chat history table not yet created'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history'
    });
  }
});

// 🗑️ Clear Chat History
router.delete('/history/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify user can only clear their own history
    if (req.user.id !== parseInt(studentId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await db.query(
      'DELETE FROM chat_history WHERE student_id = ?',
      [studentId]
    );

    res.status(200).json({
      success: true,
      message: 'Chat history cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear chat history'
    });
  }
});

// 📊 Get Chat Statistics
router.get('/stats/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify user can only access their own stats
    if (req.user.id !== parseInt(studentId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const [stats] = await db.query(
      `SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT DATE(created_at)) as days_active,
        MIN(created_at) as first_chat,
        MAX(created_at) as last_chat
       FROM chat_history 
       WHERE student_id = ?`,
      [studentId]
    );

    res.status(200).json({
      success: true,
      stats: stats[0]
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    
    // If table doesn't exist, return default stats
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(200).json({
        success: true,
        stats: {
          total_messages: 0,
          days_active: 0,
          first_chat: null,
          last_chat: null
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// 🤖 Smart Fallback Response Generator
function generateFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('math') || lowerMessage.includes('equation') || 
      lowerMessage.includes('algebra') || lowerMessage.includes('calculate')) {
    return "I'd be happy to help you with math! Can you tell me more about the specific problem you're working on? I can guide you through the steps to solve it yourself.";
  }

  if (lowerMessage.includes('science') || lowerMessage.includes('biology') || 
      lowerMessage.includes('chemistry') || lowerMessage.includes('physics')) {
    return "Science questions are great! Let me help you understand this concept. Can you be more specific about what part you'd like to learn about?";
  }

  if (lowerMessage.includes('essay') || lowerMessage.includes('write') || 
      lowerMessage.includes('paragraph') || lowerMessage.includes('grammar')) {
    return "Writing is an important skill! I can help you improve your writing. What specific aspect would you like guidance on - structure, grammar, or content?";
  }

  if (lowerMessage.includes('homework') || lowerMessage.includes('assignment')) {
    return "I'm here to help you learn! Rather than giving you answers, let me guide you through understanding the concepts. What topic is your assignment about?";
  }

  if (lowerMessage.includes('study') || lowerMessage.includes('exam') || 
      lowerMessage.includes('test') || lowerMessage.includes('prepare')) {
    return "Great that you're preparing! Here are some study tips: 1) Break topics into small chunks, 2) Practice regularly, 3) Teach concepts to someone else, 4) Take breaks. What subject are you studying?";
  }

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return "Hello! I'm your AI tutor assistant. I'm here to help you learn and understand your assignments better. What would you like to study today?";
  }

  return "I'm here to help you learn! Could you please provide more details about your question? I can help with math, science, writing, and study strategies. What subject are you working on?";
}

module.exports = router;