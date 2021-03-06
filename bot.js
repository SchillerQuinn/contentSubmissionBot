//
// This is main file containing code implementing the Express server and functionality for the Express echo bot.
//
'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const path = require('path');
var messengerButton = "<html><head><title>Facebook Messenger Bot</title></head><body><h1>Facebook Messenger Bot</h1>This is a bot based on Messenger Platform QuickStart. For more details, see their <a href=\"https://developers.facebook.com/docs/messenger-platform/guides/quick-start\">docs</a>.<script src=\"https://button.glitch.me/button.js\" data-style=\"glitch\"></script><div class=\"glitchButton\" style=\"position:fixed;top:20px;right:20px;\"></div></body></html>";


// JSON stuff
const fs = require('fs');
const jsonQuery = require('json-query');
const dataFile = './.data/threads.json';




// The rest of the code implements the routes for our Express server.
let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

//get most recent version of the json file
function getData() {
  //check to see if the f ile exists
  fs.access(dataFile, (err) => {
    if (err) {
      console.log(err.code);
      if (err.code == 'ENOENT') {
        // create the file if it doesn't exist
        var data = {
          "users": []
        };
        console.log('No JSON file found. Creating blank file.');
        fs.writeFile(dataFile, JSON.stringify(data, null, 2), function(err) {
          if (err) throw err;
          console.log('Failed to write.');
        });
      } else {
        console.log(err.code);
        throw err;
      }
    }
  });
  var file = require(dataFile)
  console.log(file)
  return file;
};

function pushData(file) {
  fs.writeFile(dataFile, JSON.stringify(file, null, 2), function(err) {
    if (err) return console.log(err);
    //console.log(JSON.stringify(file),null,2);
    console.log('Writing to ' + dataFile);
  });
};

// Webhook validation
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

// Display the web page
app.get('/', function(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  res.write(messengerButton);
  res.end();
});

// Message processing
app.post('/webhook', function(req, res) {
  console.log(req.body);
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {

        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});

// Incoming events handling
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments; 
  
  //only looks at the first attachment
  if (messageAttachments){
    if (messageAttachments.length>1){
      console.log("Multiple attachements. Only using the first one.")
    }
    messageAttachments= messageAttachments[0]
  }
  if (messageText) {
    // If we receive a text message, check to see if it matches a keyword
    // and send back the template example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'Meme':
        recievedMeme(senderID)
        break
      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) { //if they submitted a picture
    //TODO: make sure they only submit one attachement
    
    // check to see if this is a new user
    console.log(messageAttachments.type)
    if (messageAttachments.type == "image") {
      console.log("it's an image");
      var file = getData(); //check the data
      var userRecord = jsonQuery('users[ID=' + senderID + ']', {
        data: file
      }).value

      var newMessage = {
        "date": timeOfMessage,
        "text": messageText,
        "imgURL": messageAttachments.payload.url
      }
      if (userRecord === null) {
        //if the user doesn't exist, create it
        console.log("New user %d! Making entry.", senderID)
        var newEntry = {
          "ID": senderID,
          "messages": [newMessage]
        }
        //console.log(JSON.stringify(newEntry, null,2));
        file.users.push(newEntry)
      } else {
        //just append the new message
        userRecord.messages.push(newMessage);
      }
      //update the json file
      pushData(file);
      recievedMeme(senderID);
    }
  }
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;
  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  switch (payload) {
    case "Submit_Meme":
      sendTextMessage(senderID, "They said they wanted a to submit a meme");
      break;
    case "Other":
      sendTextMessage(senderID, "They didn't want to submit a meme")
    default:
      sendTextMessage(senderID, payload);
  }

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  // sendTextMessage(senderID, "Postback called");
}

//////////////////////////
// Sending helpers
//////////////////////////


function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  callSendAPI(messageData);
}

function recievedMeme(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Would you like to submit a meme?",
      quick_replies: [{
          "content_type": "text",
          "title": "Yes",
          "payload": "Submit_Meme"
        },
        {
          "content_type": "text",
          "title": "No",
          "payload": "Other"
        }
      ]
    }
  };

  callSendAPI(messageData);
}


function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: process.env.PAGE_ACCESS_TOKEN
    },
    method: 'POST',
    json: messageData

  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function() {
  console.log("Listening on port %s", server.address().port);
});