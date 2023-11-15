const jwt = require('jsonwebtoken');
const { User } = require('./models');
const { SECRET_KEY } = require('./config');

// token verification middleware
const verifyJWT = (req, res, next) => {
    console.log("verifyJWT middleware hit");
    const token = req.headers['authorization'];
    if (!token) {
        console.error("No authorization header found");
        return res.status(403).json({ message: 'No token provided.' });
    }

    const splitted = token.split(' ');
    if (splitted.length !== 2 || splitted[0] !== 'Bearer') {
        console.error("Authorization header format is wrong or missing 'Bearer'");
        return res.status(403).json({ message: 'Malformed token.' });
    }

    jwt.verify(splitted[1], SECRET_KEY, (err, decoded) => {
        if (err) {
            console.error(`Failed to authenticate token (${splitted[1]}):`, err);
            return res.status(403).json({ message: 'Failed to authenticate token.' });
        }
        console.log(`Token verified successfully for user ID: ${decoded.userId}`);
        req.userId = decoded.userId;
        next();
    });
};



// admin verification middleware
const verifyAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Access denied. Not an admin.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
};

module.exports = { verifyJWT, verifyAdmin };
