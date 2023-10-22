const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    fullName: String,
    isAdmin: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);

const UserProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    profilePicture: { type: String, default: '' },
    bio: { type: String, default: '' },
});

const UserProfile = mongoose.model('UserProfile', UserProfileSchema);

module.exports = { User, UserProfile };
