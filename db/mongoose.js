//global imports
const mongoose = require('mongoose');

//mongoose supports callback by default, changing it to support promises
mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost:27017/interview_challenge', {useNewUrlParser: true});

module.exports = {mongoose};