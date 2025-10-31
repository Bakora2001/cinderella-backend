// cinderella-backend\server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();
const app = express();


// Create HTTP server for WebSockets
const server = http.createServer(app);

// WebSocket setup
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173/", // Your React frontend
    methods: ["GET", "POST"]
  }
});


// Middleware
app.use(cors());
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
const chatRoutes = require('./routes/websocketschat'); // We'll create this

// Routes
app.use('/api/users', userRoutes);        // FIRST: /api/users/*
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/websocketschat', chatRoutes); // New chat routes
app.use('/api', authRoutes); 


// Store connected users (in production, use Redis)
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userData

// WebSocket Connection Handling
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);

  // User joins the chat
  socket.on('user_join', async (userData) => {
    try {
      const { userId, username, role, email } = userData;
      
      console.log(`👤 User joined: ${username} (${role})`);
      
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
      
    } catch (error) {
      console.error('Error in user_join:', error);
    }
  });

  // Send message
  socket.on('send_message', async (messageData) => {
    try {
      const { senderId, receiverId, message, senderRole, receiverRole } = messageData;
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
        `INSERT INTO messages (sender_id, receiver_id, message, sender_role, receiver_role, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [senderId, receiverId, message, senderRole, receiverRole, timestamp]
      );

      const messageObj = {
        id: result.insertId,
        senderId,
        receiverId,
        message,
        senderRole: sender.role,
        receiverRole,
        timestamp,
        senderName: sender.username
      };

      // Send to receiver if online
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', messageObj);
      }

      // Send confirmation to sender
      socket.emit('message_sent', messageObj);

      console.log(`💬 Message from ${sender.username} to ${receiverId}`);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Get chat history
  socket.on('get_chat_history', async (data) => {
    try {
      const { userId, otherUserId } = data;
      const user = userSockets.get(socket.id);
      
      if (!user) return;

      const [messages] = await db.query(
        `SELECT * FROM messages 
         WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?) 
         ORDER BY timestamp ASC`,
        [userId, otherUserId, otherUserId, userId]
      );

      socket.emit('chat_history', messages);
      
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const receiverSocketId = connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: data.userId,
        isTyping: true
      });
    }
  });

  socket.on('typing_stop', (data) => {
    const receiverSocketId = connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: data.userId,
        isTyping: false
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = userSockets.get(socket.id);
    if (user) {
      console.log(`❌ User disconnected: ${user.username}`);
      
      connectedUsers.delete(user.userId);
      userSockets.delete(socket.id);

      // Broadcast offline status
      socket.broadcast.emit('user_offline', {
        userId: user.userId,
        isOnline: false
      });
    }
  });
});

// Helper function to check if chat is allowed
function isChatAllowed(senderRole, receiverRole) {
  // Students cannot chat with other students
  if (senderRole === 'student' && receiverRole === 'student') {
    return false;
  }
  
  // All other combinations are allowed
  return true;
}

// Default router
app.get('/', (req, res) => {
  res.send('Cinderella Backend API is running...');
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
});