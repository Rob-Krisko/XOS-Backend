const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { checkDbConnection } = require('./dbHelpers');
const { MONGO_URI, SECRET_KEY, corsOptions } = require('./config');

const { User, UserProfile, Event } = require('./models');
const { Document } = require('./models');
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
            userId: user._id,
            isAdmin: user.isAdmin
        });
    } catch (err) {
        console.error("Login error:", err);
        
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

// Get events for a specific user
router.get('/events', verifyJWT, async (req, res) => {
    console.log(`Fetching events for user ID: ${req.userId}`);
    try {
        const events = await Event.find({ userId: req.userId });
        console.log(`Found ${events.length} events for user ID ${req.userId}`);
        res.status(200).json(events);
    } catch (err) {
        console.error(`Error fetching events for user ID ${req.userId}: ${err.message}`);
        res.status(500).json({ message: 'Error fetching events', error: err.message });
    }
});


// Create a new event
router.post('/events', verifyJWT, async (req, res) => {
    console.log('Attempting to create a new event:', req.body);
    try {
        const newEvent = new Event(req.body);
        await newEvent.save();
        console.log('Event created:', newEvent);
        res.status(201).json(newEvent);
    } catch (err) {
        console.error(`Error creating event: ${err.message}`);
        res.status(500).json({ message: 'Error creating event', error: err.message });
    }
});


// Update an event
router.put('/events/:eventId', verifyJWT, async (req, res) => {
    console.log(`Updating event with ID ${req.params.eventId}:`, req.body);
    try {
        const updatedEvent = await Event.findByIdAndUpdate(req.params.eventId, req.body, { new: true });
        if (!updatedEvent) {
            console.error(`Event not found for ID: ${req.params.eventId}`);
            return res.status(404).json({ message: 'Event not found' });
        }
        console.log('Event updated:', updatedEvent);
        res.status(200).json(updatedEvent);
    } catch (err) {
        console.error(`Error updating event with ID ${req.params.eventId}: ${err.message}`);
        res.status(500).json({ message: 'Error updating event', error: err.message });
    }
});


// Delete an event
router.delete('/events/:eventId', verifyJWT, async (req, res) => {
    console.log(`Deleting event with ID: ${req.params.eventId}`);
    try {
        const event = await Event.findByIdAndDelete(req.params.eventId);
        if (!event) {
            console.error(`Event not found for ID: ${req.params.eventId}`);
            return res.status(404).json({ message: 'Event not found' });
        }
        console.log('Event deleted:', req.params.eventId);
        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (err) {
        console.error(`Error deleting event with ID ${req.params.eventId}: ${err.message}`);
        res.status(500).json({ message: 'Error deleting event', error: err.message });
    }
});

// Save a document
router.post('/api/documents/save', verifyJWT, async (req, res) => {
    const { name, content } = req.body;
    const userId = req.userId;
    try {
        const newDocument = new Document({ name, content, userId });
        await newDocument.save();
        res.status(200).json({ message: 'Document saved successfully', documentId: newDocument._id });
    } catch (error) {
        console.error("Save document error:", error);
        res.status(500).json({ message: 'Error saving document', error: error.message });
    }
});


// Load a document
router.get('/api/documents/load/:docId', verifyJWT, async (req, res) => {
    const { docId } = req.params;
    try {
        const document = await Document.findById(docId);
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.status(200).json(document);
    } catch (error) {
        console.error("Load document error:", error);
        res.status(500).json({ message: 'Error loading document', error: error.message });
    }
});



// Fetch all documents for a specific user
router.get('/api/documents', verifyJWT, async (req, res) => {
    const userId = req.userId;
    try {
        const documents = await Document.find({ userId }).sort({ updatedAt: -1 });
        res.status(200).json(documents);
    } catch (error) {
        console.error("Fetch documents error:", error);
        res.status(500).json({ message: 'Error fetching documents', error: error.message });
    }
});



module.exports = router;