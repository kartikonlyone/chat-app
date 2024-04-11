// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001','http://localhost:3000']
}));
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect('mongodb+srv://kartiknd999:Kartik%40123@cluster0.u7qtusw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error);
  process.exit(1);
});

// User model
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  location: { // Add location field
    type: String // Modify the type according to your requirements (e.g., String, Object, Array, etc.)
  }
});

const User = mongoose.model('User', userSchema);

// JWT Secret Key
const JWT_SECRET = 'kartik';

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const io = socketIo(server,{
  cors: {
    origin: ["http://localhost:3001","http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Store connected users
const users = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  // Generate a unique ID for the user
  const userId = socket.id;

  // Add the user to the users object
  users[userId] = { id: userId, name: `User${Object.keys(users).length + 1}` };

  // Notify all clients about the new user
  io.emit('userConnected', users[userId]);

  socket.on('message', (data) => {
    const { username, message, image } = data;
    // Broadcast the message to all connected clients
    io.emit('message', { username, message, image });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');

    // Remove the user from the users object
    delete users[userId];

    // Notify all clients about the disconnected user
    io.emit('userDisconnected', userId);
  });
});


// Register route
app.post('/auth/register', async (req, res) => {
  const { username, name, email, phone,location, password } = req.body;

  try {
    // Create a new user in the database
    const newUser = new User({ username, name, email, phone,location, password });
    await newUser.save();

    // Optionally, you can generate a JWT token for the newly registered user and send it back as a response
    const token = jwt.sign({ username: newUser.username }, JWT_SECRET);
    
    res.status(201).json({ message: 'User registered successfully', token });
  } catch (error) {
    // If there's an error, handle it and send an appropriate response
    console.error('Registration failed:', error);
    res.status(500).json({ message: 'Registration failed. Please try again later.' });
  }
});


// Login route with JWT token generation
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.password !== password) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Generate JWT token
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });

    // Send JWT token in response
    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('An error occurred during login:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Your existing server code with JWT authentication middleware

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Missing token' });
  }

  jwt.verify(token.split(' ')[1], JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Fetch profile route protected by JWT authentication
app.get('/profile', verifyToken, (req, res) => {
  const { username } = req.user; // Get username from decoded token
  // Fetch user profile data
  User.findOne({ username })
    .then(user => {
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.status(200).json({ user });
    })
    .catch(error => {
      console.error('An error occurred while fetching profile:', error.message);
      res.status(500).json({ message: 'Internal server error' });
    });
});

// Route to search users by username and location
app.get('/users/search', async (req, res) => {
  const { query, location } = req.query;

  try {
    // Use a regular expression to perform a case-insensitive search for users by username
    let queryCondition = { username: { $regex: new RegExp(query, 'i') } };

    // If location is provided, include it in the query condition
    if (location) {
      queryCondition = { ...queryCondition, location: { $regex: new RegExp(location, 'i') } };
    }

    const users = await User.find(queryCondition);
    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log('WebSocket server initialized');
});
