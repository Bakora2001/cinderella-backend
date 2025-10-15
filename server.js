const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth'); 
const userRoutes = require('./routes/users');
const assignmentRoutes = require('./routes/assignments');

dotenv.config();
const app = express();

app.use('/uploads', express.static('uploads')); // serve uploaded files

app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api/assignments', assignmentRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
