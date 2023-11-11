const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { checkDbConnection } = require('./dbHelpers');
const { MONGO_URI, SECRET_KEY, corsOptions } = require('./config');

const { User, UserProfile } = require('./models');
const { verifyJWT, verifyAdmin } = require('./middleware');

const router = express.Router();

router.use((req, res, next) => {
    console.log(`Received ${req.method} request for ${req.url}`);
    next();
});

// Get all users with their profiles
router.get('/admin/users', verifyJWT, verifyAdmin, async (req, res) => {
    console.log('Entered /admin/users route');
    
    try {
        const users = await User.find().lean();
        const profiles = await UserProfile.find({ userId: { $in: users.map(u => u._id) } }).lean();

        // Attach profiles to corresponding users
        users.forEach(user => {
            user.profile = profiles.find(profile => profile.userId.toString() === user._id.toString()) || {};
        });

        console.log('Returning users:', users);
        res.status(200).json(users);
    } catch (err) {
        console.error('Error in /admin/users:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

// Update a user
router.put('/admin/users/:userId', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.userId, req.body, { new: true });
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

// Delete a user
router.delete('/admin/users/:userId', verifyJWT, verifyAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.userId);
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

// Registration Endpoint
router.post('/register', async (req, res) => {
    console.log("Register endpoint hit with data:", req.body);
    try {
        checkDbConnection(); // Check MongoDB connection state
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
        
        // Check if it's a timeout error
        if (err.kind === 'ObjectId' && err.reason && err.reason.message && err.reason.message.includes('timed out')) {
            return res.status(500).json({ message: 'Database operation timed out', error: err.message });
        }
        
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

//Login endpoint
router.post('/login', async (req, res) => {
    console.log("Login endpoint hit with data:", req.body);
    try {
        checkDbConnection(); // Check MongoDB connection state
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
        return res.status(200).json({ 
            message: 'Login successful', 
            token, 
            username: user.username,
            isAdmin: user.isAdmin  // Include isAdmin field in the response
        });
    } catch (err) {
        console.error("Login error:", err);
        
        // Check if it's a timeout error
        if (err.kind === 'ObjectId' && err.reason && err.reason.message && err.reason.message.includes('timed out')) {
            return res.status(500).json({ message: 'Database operation timed out', error: err.message });
        }
        
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});


// profile update endpoints
router.get('/profile/:username', verifyJWT, async (req, res) => {
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


router.put('/profile/:username/update', verifyJWT, async (req, res) => { 
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



router.get('/api/userid/:username', verifyJWT, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ userId: user._id.toString() });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching user ID', error: err.message });
    }
});

// Get events for a specific user
router.get('/events/:userId', verifyJWT, async (req, res) => {
    try {
        const events = await Event.find({ userId: req.params.userId });
        res.status(200).json(events);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching events', error: err.message });
    }
});

// Create a new event
router.post('/events', verifyJWT, async (req, res) => {
    try {
        const newEvent = new Event(req.body);
        await newEvent.save();
        res.status(201).json(newEvent);
    } catch (err) {
        res.status(500).json({ message: 'Error creating event', error: err.message });
    }
});

// Update an event
router.put('/events/:eventId', verifyJWT, async (req, res) => {
    try {
        const updatedEvent = await Event.findByIdAndUpdate(req.params.eventId, req.body, { new: true });
        res.status(200).json(updatedEvent);
    } catch (err) {
        res.status(500).json({ message: 'Error updating event', error: err.message });
    }
});

// Delete an event
router.delete('/events/:eventId', verifyJWT, async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.eventId);
        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting event', error: err.message });
    }
});

module.exports = router;