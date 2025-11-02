// cinderella-backend\server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();
const app = express();

// Create HTTP server for WebSockets
const server = http.createServer(app);

// WebSocket setup with proper CORS
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Your React frontend (removed trailing slash)
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Debug middleware - logs all requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Import route files
const authRoutes = require('./routes/auth'); 
const userRoutes = require('./routes/users');
const assignmentRoutes = require('./routes/assignments');
const chatbotRoutes = require('./routes/chatbot-free'); // Use free version
const submissionsRoutes = require('./routes/submissions');
const chatRoutes = require('./routes/websocketschat'); // Chat routes

// Routes
app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/websocketschat', chatRoutes);
app.use('/api', authRoutes); 

// Store connected users (in production, use Redis)
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userData

// ==================== WEBSOCKET CONNECTION HANDLING ====================
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);

  // User joins the chat
  socket.on('user_join', async (userData) => {
    try {
      const { userId, username, role, email } = userData;
      
      console.log(`👤 User joined: ${username} (${role}) - ID: ${userId}`);
      
      // Store user connection
      connectedUsers.set(userId, socket.id);
      userSockets.set(socket.id, {
        userId,
        username,
        role,
        email,
        socketId: socket.id,
        joinedAt: new Date()
      });

      // Broadcast online status to all connected users
      socket.broadcast.emit('user_online', {
        userId,
        username,
        role,
        isOnline: true
      });

      // Send current online users to the newly connected user
      const onlineUsers = Array.from(userSockets.values()).map(user => ({
        userId: user.userId,
        username: user.username,
        role: user.role,
        isOnline: true
      }));

      socket.emit('online_users', onlineUsers);
      
      console.log(`✅ Total online users: ${onlineUsers.length}`);
      
    } catch (error) {
      console.error('❌ Error in user_join:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Send message
  socket.on('send_message', async (messageData) => {
    try {
      const { senderId, receiverId, message, senderRole, receiverRole, assignmentId } = messageData;
      const sender = userSockets.get(socket.id);
      
      if (!sender) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Check if conversation is allowed
      if (!isChatAllowed(sender.role, receiverRole)) {
        socket.emit('error', { message: 'Chat not allowed with this user' });
        return;
      }

      const timestamp = new Date();
      
      // Save message to database
      const [result] = await db.query(
        `INSERT INTO messages (sender_id, receiver_id, message, sender_role, receiver_role, assignment_id, timestamp, is_read) 
         VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
        [senderId, receiverId, message, senderRole, receiverRole, assignmentId || null, timestamp]
      );

      const messageObj = {
        id: result.insertId,
        senderId,
        receiverId,
        message,
        senderRole: sender.role,
        senderName: sender.username,
        receiverRole,
        assignmentId,
        timestamp,
        isRead: false
      };

      // Send to receiver if online
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', messageObj);
        console.log(`✉️ Message delivered to ${receiverId}`);
      } else {
        console.log(`📭 Receiver ${receiverId} is offline, message saved to DB`);
      }

      // Send confirmation to sender
      socket.emit('message_sent', messageObj);

      console.log(`💬 Message: ${sender.username} → ${receiverId}`);

    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Get chat history
  socket.on('get_chat_history', async (data) => {
    try {
      const { userId, otherUserId } = data;
      const user = userSockets.get(socket.id);
      
      if (!user) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      const [messages] = await db.query(
        `SELECT m.*, u.username as sender_name
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.id
         WHERE (m.sender_id = ? AND m.receiver_id = ?) 
            OR (m.sender_id = ? AND m.receiver_id = ?) 
         ORDER BY m.timestamp ASC`,
        [userId, otherUserId, otherUserId, userId]
      );

      socket.emit('chat_history', messages);
      
      // Mark messages from other user as read
      await db.query(
        `UPDATE messages 
         SET is_read = TRUE 
         WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
        [otherUserId, userId]
      );

      console.log(`📜 Sent ${messages.length} messages to ${user.username}`);
      
    } catch (error) {
      console.error('❌ Error fetching chat history:', error);
      socket.emit('error', { message: 'Failed to fetch chat history' });
    }
  });

  // Mark messages as read
  socket.on('mark_as_read', async (data) => {
    try {
      const { conversationUserId } = data;
      const user = userSockets.get(socket.id);
      
      if (!user) return;

      await db.query(
        `UPDATE messages 
         SET is_read = TRUE 
         WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
        [conversationUserId, user.userId]
      );

      console.log(`✅ Messages marked as read: ${conversationUserId} → ${user.username}`);
      
    } catch (error) {
      console.error('❌ Error marking messages as read:', error);
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const user = userSockets.get(socket.id);
    if (!user) return;

    const receiverSocketId = connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: user.userId,
        username: user.username,
        isTyping: true
      });
    }
  });

  socket.on('typing_stop', (data) => {
    const user = userSockets.get(socket.id);
    if (!user) return;

    const receiverSocketId = connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: user.userId,
        username: user.username,
        isTyping: false
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = userSockets.get(socket.id);
    if (user) {
      console.log(`❌ User disconnected: ${user.username} (${user.role})`);
      
      connectedUsers.delete(user.userId);
      userSockets.delete(socket.id);

      // Broadcast offline status
      socket.broadcast.emit('user_offline', {
        userId: user.userId,
        username: user.username,
        isOnline: false
      });

      console.log(`📊 Remaining online users: ${userSockets.size}`);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('⚠️ Socket error:', error);
  });
});

// Helper function to check if chat is allowed
function isChatAllowed(senderRole, receiverRole) {
  // Students cannot chat with other students
  if (senderRole === 'student' && receiverRole === 'student') {
    return false;
  }
  
  // All other combinations are allowed (admin-admin, admin-teacher, admin-student, teacher-student, etc.)
  return true;
}

// Default route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Cinderella Backend API is running...',
    websocket: 'Socket.IO enabled',
    timestamp: new Date()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    onlineUsers: userSockets.size,
    timestamp: new Date()
  });
});

// 404 handler - should be LAST
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route not found: ${req.method} ${req.path}`,
    hint: 'Check if the route is properly defined and the server has been restarted'
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 Cinderella Backend Server Started');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO enabled on: http://localhost:${PORT}`);
  console.log(`🌐 Frontend URL: http://localhost:5173`);
  console.log(`👥 Online users: ${userSockets.size}`);
  console.log('='.repeat(50));
});