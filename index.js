


const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketio = require('socket.io');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors: {
        origin: 'http://localhost:5173', // Update with your frontend URL
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

const PORT = process.env.PORT || 3000;
const secretKey = '3Ct1qYTGje'; // Encryption key for messages
const jwtSecret = 'hRWmbZ28Xi'; // JWT secret for authentication

// Enable CORS
const corsOptions = {
    origin: 'http://localhost:5173', // Frontend origin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect('mongodb+srv://salty:salty@salty.cvsin.mongodb.net/salty', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err.message));

// Message Schema
const messageSchema = new mongoose.Schema({
    fromUserId: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
});

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    userId: { type: String, unique: true, required: true },
    messages: [messageSchema], // Embedded messages for each user
    anonymousLinks: [{ // New field to store anonymous links
        link: String,
        createdAt: { type: Date, default: Date.now }
    }]
});

const User = mongoose.model('User', userSchema);

// Helper function to generate a random userId
const generateUserId = () => crypto.randomBytes(4).toString('hex');

// User Registration
app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userId = generateUserId();
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword, userId });
        await newUser.save();
        const token = jwt.sign({ userId, email }, jwtSecret, { expiresIn: '1h' });
        res.json({ token, userId });
    } catch (err) {
        console.error(err);
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Email already in use' });
        }
        res.status(500).send('Server error');
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.userId, email: user.email }, jwtSecret, { expiresIn: '1h' });
        res.json({ token, userId: user.userId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Generate Anonymous Link
app.post('/generate-anonymous-link', async (req, res) => {
    const { userId } = req.body; // Get the logged-in user's ID
    const anonymousLink = crypto.randomBytes(16).toString('hex'); // Generate a unique link

    try {
        await User.updateOne(
            { userId },
            { $push: { anonymousLinks: { link: anonymousLink } } }
        );
        const fullLink = `http://localhost:3000/anonymous/${anonymousLink}`; // Update this with your frontend URL
        res.json({ link: fullLink });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

//New one
io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User with ID ${socket.id} joined room: ${roomId}`);
    });

    socket.on('chatMessage', ({ message, roomId, userId }) => {
        // Emit the message to the room
        io.to(roomId).emit('message', { fromUserId: userId, message });
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
    });
});

app.post('/generate-anonymous-link', (req, res) => {
    const { userId } = req.body;
    // Generate a unique room ID (you can use UUID, timestamp, or any unique identifier)
    const roomId = `${userId}-${Date.now()}`;
    res.json({ link: `http://localhost:5173/anonymous/${roomId}` });
});

// Handle Incoming Anonymous Messages
app.post('/send-anonymous-message/:link', async (req, res) => {
    const { link } = req.params;
    const { message } = req.body;

    try {
        // Find the user associated with the anonymous link
        const user = await User.findOne({ "anonymousLinks.link": link });

        if (!user) {
            return res.status(404).json({ message: 'Link not found' });
        }

        // Create the message object
        const newMessage = { fromUserId: 'Anonymous', message };

        // Save message to user's messages
        await User.updateOne({ userId: user.userId }, { $push: { messages: newMessage } });

        res.json({ message: 'Message sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/anonymous/:link', (req, res) => {
    const link = req.params.link;

    // Optionally, you can check if the link exists in the database or perform any logic here

    // Example JSON response
    res.json({
        message: "Anonymous link received.",
        link: link
    });
});


// Socket.io events
io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);

        // Send existing messages for the room
        User.findOne({ userId: roomId })
            .then(user => {
                if (user) {
                    socket.emit('loadMessages', user.messages);
                }
            })
            .catch(err => console.error(err));
    });

    socket.on('chatMessage', ({ message, roomId, userId }) => {
        const decryptedMessage = CryptoJS.AES.decrypt(message, secretKey).toString(CryptoJS.enc.Utf8);
        const newMessage = { fromUserId: userId, message: decryptedMessage };

        // Save message to user's messages
        User.updateOne({ userId }, { $push: { messages: newMessage } })
            .then(() => {
                io.to(roomId).emit('message', newMessage); // Broadcast message to room
            })
            .catch(err => console.error(err));
    });

    // Handle anonymous messages
    socket.on('sendAnonymousMessage', ({ link, message }) => {
        // Emit to the room or directly to the user
        io.to(link).emit('anonymousMessage', { message, fromUserId: 'Anonymous' });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
