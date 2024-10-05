const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketio = require('socket.io');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 3000;
const secretKey = '3Ct1qYTGje'; // Encryption key

// Enable CORS
app.use(cors({
  origin: 'http://localhost:5173', // Replace with your frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// MongoDB connection
mongoose.connect('mongodb+srv://browny:browny@browny.mpcnbcf.mongodb.net/browny', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Message Schema and Model
const messageSchema = new mongoose.Schema({
  fromUserId: String,
  toUserId: String,
  roomId: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Generate random User ID
const generateUserId = () => crypto.randomBytes(4).toString('hex');

// Random Nicknames
const randomNicknames = ['Skywalker', 'BlackPanther', 'IronMan', 'Thor', 'WonderWoman', 'Spiderman'];
const getRandomNickname = () => randomNicknames[Math.floor(Math.random() * randomNicknames.length)];

// In-memory store for active users
let waitingUser = null;
let activeUsers = new Map();
let blockedUsers = new Set();

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Socket.IO for real-time chat functionality
io.on('connection', (socket) => {
  const userId = generateUserId();
  socket.userId = userId;
  const nickname = getRandomNickname();
  socket.nickname = nickname;

  console.log(`User connected: ${userId} (${nickname})`);

  // Emit user info to the client
  socket.emit('userInfo', { userId, nickname });

  // Handle room join
  socket.on('joinRoom', async (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;

    // Load previous messages for the room
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 });
    socket.emit('loadMessages', messages);
  });

  // Handle incoming chat message
  socket.on('chatMessage', async ({ message, roomId }) => {
    if (roomId) {
      const decryptedMessage = CryptoJS.AES.decrypt(message, secretKey).toString(CryptoJS.enc.Utf8);
      
      // Emit message to the room
      io.to(roomId).emit('message', { from: socket.nickname, message: decryptedMessage });

      // Save the encrypted message in the database
      const newMessage = new Message({
        fromUserId: socket.userId,
        roomId,
        message
      });
      await newMessage.save();
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
