const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 5000;
const SECRET_KEY = process.env.SECRET_KEY;
const MONGO_URI = process.env.MONGO_URI;

const corsOptions = {
    origin: 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

// Middlewares
app.use(cors(corsOptions));
app.use(bodyParser.json());

// for when we actually deploy
if (process.env.NODE_ENV === 'production') {
    app.use(express.static('client/build'));
}

// token verification middleware
const verifyJWT = (req, res, next) => {
    console.log("verifyJWT middleware hit"); 
    const token = req.headers['authorization'].split(' ')[1];
    if (!token) {
        console.error("No token provided");
        return res.status(403).json({ message: 'No token provided.' });
    }
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            console.error(`Failed to authenticate token (${token}):`, err);
            return res.status(403).json({ message: 'Failed to authenticate token.' });
        }
        req.userId = decoded.userId;
        next();
    });
};

// MongoDB connection
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB Atlas");
}).catch((error) => {
    console.error("Error connecting to MongoDB:", error);
});

// database models
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    fullName: String
});

const User = mongoose.model('User', UserSchema);

const UserProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    profilePicture: { type: String, default: '' },
    bio: { type: String, default: '' },
});

const UserProfile = mongoose.model('UserProfile', UserProfileSchema);

// to test the server
app.get('/', (req, res) => {
    res.send('Hello from the server!');
});

// Registration Endpoint
app.post('/register', async (req, res) => {
    console.log("Register endpoint hit with data:", req.body);
    try {
        const { username, password, email, fullName } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({ username, password: hashedPassword, email, fullName });
        await user.save();

        const userProfile = new UserProfile({ userId: user._id });
        await userProfile.save();

        return res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        console.error("Registration error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

//Login endpoint
app.post('/login', async (req, res) => {
    console.log("Login endpoint hit with data:", req.body);
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(403).json({ message: 'Incorrect password' });
        }

        const token = jwt.sign({ userId: user._id }, SECRET_KEY, { expiresIn: '1h' });
        return res.status(200).json({ message: 'Login successful', token, username: user.username });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// profile update endpoints
app.get('/profile/:username', verifyJWT, async (req, res) => {
    console.log("Profile retrieval endpoint hit for username:", req.params.username);
    try {
        const { username } = req.params;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const profile = await UserProfile.findOne({ userId: user._id }).populate('userId', 'username email fullName');

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        res.status(200).json(profile);
    } catch (err) {
        console.error("Fetching profile error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});


app.put('/profile/:username/update', verifyJWT, async (req, res) => {
    console.log("Profile update endpoint hit for username:", req.params.username, "with data:", req.body);
    try {
        const { username } = req.params;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const userId = user._id;
        const { profilePicture, bio } = req.body;

        const profile = await UserProfile.findOneAndUpdate({ userId }, { profilePicture, bio }, { new: true });

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        res.status(200).json(profile);
    } catch (err) {
        console.error("Updating profile error:", err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
    });
}

// Default error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});

// handle database disconnections
mongoose.connection.on('disconnected', () => {
    console.error('MongoDB disconnected!');
});

process.on('SIGINT', () => {
    mongoose.connection.close(() => {
        console.log('Closed MongoDB connection.');
        process.exit(0);
    });
});