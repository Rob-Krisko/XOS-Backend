const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = 5000;
const SECRET_KEY = process.env.SECRET_KEY;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB Atlas");
}).catch((error) => {
    console.error("Error connecting to MongoDB:", error);
});

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    fullName: String
});

const User = mongoose.model('User', UserSchema);

app.use(cors());
app.use(bodyParser.json());

// Registration Endpoint
app.post('/register', async (req, res) => {
    const { username, password, email, fullName } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ username, password: hashedPassword, email, fullName });
    await user.save();

    return res.status(201).json({ message: 'User registered successfully' });
});

// Login Endpoint
app.post('/login', async (req, res) => {
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
    return res.status(200).json({ message: 'Login successful', token });
});

app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});

// Handle app termination gracefully
process.on('SIGINT', () => {
    mongoose.connection.close(() => {
        console.log('Closed MongoDB connection.');
        process.exit(0);
    });
});
