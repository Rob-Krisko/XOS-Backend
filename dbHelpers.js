// dbHelpers.js
const mongoose = require('mongoose');


function checkDbConnection() {
    const state = mongoose.connection.readyState;
    if (state === 0) {
        console.warn("MongoDB: Not connected");
    } else if (state === 1) {
        console.log("MongoDB: Connected");
    } else if (state === 2) {
        console.log("MongoDB: Connecting");
    } else if (state === 3) {
        console.warn("MongoDB: Disconnecting");
    }
}

module.exports = { checkDbConnection };
