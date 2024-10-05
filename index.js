const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketio = require('socket.io');
const crypto = require('crypto');
const multer = require('multer');
const CryptoJS = require('crypto-js');
const path = require('path');
const cors = require('cors'); // Import CORS

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 3000;
const secretKey = 'supersecretkey'; // Key for encryption

// Enable CORS
app.use(cors({
    origin: 'http://localhost:5173', // Replace with your frontend URL
    methods: ['GET', 'POST'], // Allowed methods
    allowedHeaders: ['Content-Type'], // Allowed headers
}));


// MongoDB connection
mongoose.connect('mongodb+srv://browny:browny@browny.mpcnbcf.mongodb.net/browny', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
  });

// Message Schema and Model
const messageSchema = new mongoose.Schema({
    fromUserId: String,
    toUserId: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define a route for the root URL
app.get('/', (req, res) => {
    res.send('Welcome to the Anonymous Chat API!'); // A simple message or an HTML page
});


// Generate Random User ID
const generateUserId = () => {
    return crypto.randomBytes(4).toString('hex'); // 8 character random user id
};

// Generate Random Nicknames
const randomNicknames = ['Skywalker', 'BlackPanther', 'IronMan', 'Thor', 'WonderWoman', 'Spiderman'];

const getRandomNickname = () => {
    return randomNicknames[Math.floor(Math.random() * randomNicknames.length)];
};

// In-memory store for active users
let waitingUser = null;
let activeUsers = new Map(); // Store active users and their socket IDs
let blockedUsers = new Set(); // Store blocked users

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Socket.IO for real-time chat functionality
io.on('connection', (socket) => {
    const userId = generateUserId();
    socket.userId = userId;
    const nickname = getRandomNickname();
    socket.nickname = nickname;

    console.log(`User connected: ${userId} (${nickname})`);

    // Emit the nickname to the frontend
    socket.emit('nicknameAssigned', nickname);

    // Check if there is a waiting user to pair with
    if (waitingUser) {
        // Pair with the waiting user
        const pairedUser = waitingUser;
        waitingUser = null;

        socket.emit('paired', { userId: pairedUser.userId, nickname: pairedUser.nickname });
        pairedUser.emit('paired', { userId: socket.userId, nickname: socket.nickname });

        socket.partner = pairedUser;
        pairedUser.partner = socket;
    } else {
        waitingUser = socket;
        socket.emit('waiting');
    }

    // Handle chat message with encryption
    socket.on('chatMessage', async ({ message }) => {
        if (socket.partner) {
            const encryptedMessage = CryptoJS.AES.encrypt(message, secretKey).toString();
            socket.emit('message', { from: 'me', message });
            socket.partner.emit('message', { from: socket.nickname, message });

            // Save the encrypted message to the database
            const newMessage = new Message({
                fromUserId: socket.userId,
                toUserId: socket.partner.userId,
                message: encryptedMessage
            });
            await newMessage.save();
        }
    });

    // Handle typing indicator
    socket.on('typing', () => {
        if (socket.partner) {
            socket.partner.emit('typingIndicator');
        }
    });

    socket.on('stopTyping', () => {
        if (socket.partner) {
            socket.partner.emit('stopTypingIndicator');
        }
    });

    // File sharing functionality
    app.post('/upload', upload.single('file'), (req, res) => {
        const fileUrl = `https://anony-api.onrender.comu/uploads/${req.file.filename}`;
        if (socket.partner) {
            socket.partner.emit('fileShared', { from: socket.nickname, fileUrl });
        }
        res.send({ fileUrl });
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        if (waitingUser === socket) {
            waitingUser = null;
        } else if (socket.partner) {
            socket.partner.emit('partnerDisconnected');
        }
    });

    // Blocking users
    socket.on('blockUser', (blockedUserId) => {
        blockedUsers.add(blockedUserId);
        socket.emit('userBlocked');
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
