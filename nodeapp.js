//global imports
const zmq = require('zmq');
const moment = require('moment');
const _ = require('lodash');

//local imports
const {mongoose} = require('./db/mongoose');
const {transaction} = require('./db/transactionModel');
const {recurring} = require('./db/transactionModel');

const port = 1984;
var socket = zmq.socket('rep');

// Begin listening for connections on all IP addresses on port 1984.
socket.bind(`tcp://127.0.0.1:${port}`, (err) => {
    if (err) {
        console.log("Failed to bind socket: " + err.message);
        process.exit(0);
    }
    console.log(`Socket is on ${port}`);
});

//sorting function to sort transactions according to date in descending order
function sort_date(b, a) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
}

//Storing the recurring transactions of the users into the recurring collection
function saveToMongo(user, orderedResultArray) {
    recurring.findOneAndUpdate(
        {user_id: user},
        {
            recurring_transactions: JSON.stringify(orderedResultArray)
        },
        {upsert: true}, 
        (err, doc) => {
        if(err)
            console.log(`Error: ${err}`);
    });

}

//formats the response before sending to the client
function resultFormatter(response, user) {
    var bufferAmount = 1000;
    var resultArray = [];
    for(var key in response) {
        for(var i = 0;i < response[key].length; i++) {
            var dateBuffer = (response[key][i][0].date.getTime() - response[key][i][1].date.getTime());
            var time = moment(response[key][i][0].date.getTime() + dateBuffer).format();
            var result = {
                "name": response[key][i][0].name,
                "user_id": user,
                "next_amt": response[key][i][0].amount + bufferAmount,
                "next_date": time,
                "transactions": response[key][i]
            };
            resultArray.push(result);
        }
    }
    const orderedResultArray = _.orderBy(resultArray, ['name']);
    socket.send(JSON.stringify(orderedResultArray));
    saveToMongo(user, orderedResultArray);
}

//function to get the recurring transactions
var getRecurringTransactions = (user, highLimit, lowerLimit, factor) => {
    return new Promise((resolve, reject) => {
        var response = {};
        transaction.aggregate([
        { 
            $match: { user_id: user} },
        { 
            $group: {
                _id: {user_id: "$user_id", company: "$companyName"},
                details: {$push: {name: "$name", trans_id: "$trans_id", amount: "$amount", date: "$date"} }
            }
        }
        ], ((err, res) => {
                if (err) 
                    console.log(`Error: ${err}`);
                else {  
                    for(let i = 0; i<res.length; i++) {
                        var detailsArray = res[i].details.sort(sort_date);
                        while(detailsArray.length > 0) {
                            var list = [];
                            var currentSec = (new Date('2018-08-10T08:00:00.000Z').getTime())/factor;
                            //checks whether the latest transaction is current, if not discards it
                            if(((currentSec - (detailsArray[0].date.getTime()/factor))) > highLimit) {
                                detailsArray.splice(0, 1);
                                break;
                            }
                            list.push(detailsArray[0]);
                            currentSec = detailsArray[0].date.getTime()/factor;
                            detailsArray.splice(0, 1);
                            while(detailsArray.length > 0) {
                                var found = detailsArray.find((detail) => {
                                    var detailDate = detail.date.getTime()/factor;
                                    return (((currentSec - detailDate) <= highLimit) &&
                                    ((currentSec - detailDate) >= lowerLimit));
                                });
                                if(found === undefined) {
                                    currentSec = (new Date('2018-08-10T08:00:00.000Z').getTime())/factor;
                                    break;
                                }
                                var index = detailsArray.indexOf(found);
                                currentSec = detailsArray[index].date.getTime()/factor;
                                list.push(detailsArray[index]);
                                detailsArray.splice(index, 1);
                            }
                            if (list.length > 2) {
                                if(response[[res[i]._id.company]] === undefined)
                                    response[[res[i]._id.company]] = [];
                                response[[res[i]._id.company]].push(list);
                                    
                            }
                        }
                    }
                    if(response)
                        resolve(response);
                    else
                        reject("Error: Couldn't find any recurrent transactions");
                }
            })
        );
    });
}

// A callback for the event that is invoked a message is received.
socket.on('message', (message) => {         // on message
    let jsonMessage = JSON.parse(message);
    //Upsert transactions
    if (jsonMessage.task === "upsert_transactions") {
        for(let i = 0; i < jsonMessage.transactions.length; i++) {
            var tran = jsonMessage.transactions[i];
            date = new Date(tran.date);
            //separating the reference number from the name of the transaction 
            var name = JSON.stringify(tran.name).replace(/\d/g,"").trim();
            transaction.findOneAndUpdate(
                {trans_id: tran.trans_id},
                {
                    user_id: tran.user_id,
                    trans_id: tran.trans_id,
                    companyName: name,
                    name: tran.name,
                    amount: tran.amount,
                    date: date,
                },
                {upsert: true}, 
                (err, doc) => {
                if(err)
                    console.log(`Error: ${err}`);
            });
        }
        var user = jsonMessage.transactions[0].user_id;
        const RecurringTransactions = async (user_id) => {
            //Calculating weekly recurring transactions
            var weekly = await getRecurringTransactions(user_id, 192, 144, 3600000);
            //Calculating monthly recurring transactions
            var monthly = await getRecurringTransactions(user_id, 840, 648, 3600000);
            //Calculating yearly recurring transactions
            var yearly = await getRecurringTransactions(user_id, 31795200000, 31536000000, 1);
            //Combining all the dictionaries into one dictionary
            const list = Object.assign(weekly, monthly);
            const finalList = Object.assign(yearly, list);
            if(finalList === undefined)
                throw new Error(`Couldn't get any recurring transaction for ${user_id}`);
            return finalList;
        };

        RecurringTransactions(user).then((response) => {
        resultFormatter(response, user);
        }).catch((err) => {
            console.log(err);
        });
    }
    //Get recurring transactions
    else if (jsonMessage.task === "get_recurring_trans") {
        result = [];
        recurring.find({}, (err, doc) => {
            for(var i = 0; i < doc.length; i++) 
                result.push(JSON.parse(doc[i].recurring_transactions));
            socket.send(JSON.stringify(result));
            if(err)
                console.log(`Error: ${err}`);
        });
    }
}, setTimeout(() => {
       console.log("Waited 10 seconds, Socket has been closed");
       socket.close();
    }, 10000)
);