//global imports
const mongoose = require('mongoose');

var transactionSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    trans_id: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    company_name: {
        type: String,
        required: true,
        minlength: 1,
    },
    name: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        minlength: 1
    },
    date: {
        type: Date,
        required: true,
    }
});

var recurringSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        minlength: 1,
    },
    recurring_transactions: {
        type: String,
        required: true,
        minlength: 1,
    }
});

module.exports = {
    transaction: mongoose.model('transaction', transactionSchema),
    recurring: mongoose.model('recurring', recurringSchema),
};