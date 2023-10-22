const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const routes = require('./routes');
const { MONGO_URI, SECRET_KEY, corsOptions } = require('./config');
const { checkDbConnection } = require('./dbHelpers');

const app = express();

mongoose.connect(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
})
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("Failed to connect to MongoDB:", err));

app.use(bodyParser.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.send('Connected to the database');
});

app.use('/', routes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
