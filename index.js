
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const corsOptions = {
    origin: 'https://anonym-seven.vercel.app', // Frontend origin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect('mongodb+srv://frenzy:frenzy@frenzy.ogca6.mongodb.net/frenzy', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error(err));

// User Schema (email removed)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // Unique username
    password: { type: String, required: true } // Password is required
});

const User = mongoose.model('User', UserSchema);

// Link Schema
const LinkSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    link: { type: String, required: true }
});

const Link = mongoose.model('Link', LinkSchema);

// Message Schema
const MessageSchema = new mongoose.Schema({
    link: { type: mongoose.Schema.Types.ObjectId, ref: 'Link' },
    message: { type: String, required: true },
    sender: { type: String, default: 'Anonymous' }
});

const Message = mongoose.model('Message', MessageSchema);

// JWT Secret
const JWT_SECRET = 'img9JeKWPs'; // Set your JWT secret

// User Registration
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body; 

    console.log('Registration Request:', { username, password }); // Log incoming request

    // Check for valid input
    if (!username || !password) {
        return res.status(400).send("Username and password are required");
    }

    try {
        // Check if the username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send("Username already exists");
        }

        // Proceed with creating a new user
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });

        await user.save();
        res.status(201).send("User registered");
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).send("Error registering user");
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (user && (await bcrypt.compare(password, user.password))) {
        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({ token });
    } else {
        res.status(400).send("Invalid credentials");
    }
});

// Generate Link
app.post('/api/link', async (req, res) => {
    try {
        const { token } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        // Find the user by the decoded token ID
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Create a new link and associate it with the user
        const newLink = new Link({ user: user._id, link: `${user._id}-${Date.now()}` });

        await newLink.save();
        res.json({ link: newLink._id }); // Send back the linkId directly
    } catch (error) {
        console.error("Error generating link:", error);
        res.status(500).send("Error generating link");
    }
});

// Root Route for Testing
app.get('/', (req, res) => {
    res.send('Server is running anonymously');
});

// Send Anonymous Message
app.post('/api/messages', async (req, res) => {
    const { message, linkId } = req.body;
    const newMessage = new Message({ message, link: linkId });
    
    await newMessage.save();
    res.status(201).send("Message sent");
});

// Get All Messages
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().populate('link'); // Fetch all messages
        res.json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
