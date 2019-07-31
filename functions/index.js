const functions = require('firebase-functions');

const app = require('express')();

const FBAuth = require('./util/fbAuth');

const { signup, login } = require('./handlers/users');
const { getAllScreams, postOneScream } = require('./handlers/screams');

// Scream routes
app.get('/screams', getAllScreams);
app.post('/scream', FBAuth, postOneScream);

// User routes
app.post('/signup', signup);
app.post('/login', login);

//https://baseurl.com/api/
exports.api = functions.https.onRequest(app);
