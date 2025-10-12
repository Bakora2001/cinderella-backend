const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./config/db');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth'); 

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);


// (async () => {
//   const hashed = await bcrypt.hash("secret", 10);
//   console.log(hashed);
// })();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
