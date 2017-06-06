// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';

var Client = require('./azure-iot-device-diagnostic-wrapper').Client;
var Message = require('azure-iot-device').Message;
var Uuid = require('node-uuid');
var dht = require('node-dht-sensor');

var client = Client.fromConnectionString('[Your Device Connection String]', {
    samplingRateSource: 'device',
    samplingRatePercentage: 50,
    samplingStrategy: 'time'
});

var lastCallbackMsgId = null;
var lastSendMsgId = null;
var initError = null;
var messageCount = 0;

var connectCallback = function(err) {
    var sendInterval
    if (err) {
        console.error('could not connect: ' + err.message);
        setTimeout(function() {
            clearInterval(sendInterval);
            lastCallbackMsgId = null;
            lastSendMsgId = null;
            initError = null;
            client.removeAllListeners();
            client.open(connectCallback);
        }, 200);
    } else {
        console.log('client connected');
        client.on('message', function(msg) {
            console.log('receiving cloud-to-device message:');
            console.log('  body: ' + msg.data);
            client.complete(msg, printResultFor('completed')); // when using MQTT this line is a no-op
        });

        sendInterval = setInterval(function() {
            if (lastCallbackMsgId !== null && lastSendMsgId === null) {
                lastSendMsgId = lastCallbackMsgId;
            } else if (lastCallbackMsgId === null && lastSendMsgId === null) {
                if (initError !== null) {
                    initError++;
                } else {
                    initError = 0;
                }
            }

            if (lastSendMsgId !== null) lastSendMsgId++;
            if (lastSendMsgId - 3 > lastCallbackMsgId || lastSendMsgId === null && lastCallbackMsgId === null && initError > 3) {
                clearInterval(sendInterval);
                lastCallbackMsgId = null;
                lastSendMsgId = null;
                initError = null;
                client.removeAllListeners();
                client.open(connectCallback);
                return;
            }
            var uuid = Uuid.v4();
            var timestamp = new Date().toISOString();

            dht.read(22, 4, function(err, temperature, humidity) {
                var message;
                messageCount++;
                if (err) {
                    message = new Message(JSON.stringify({
                        'deviceId': 'raspi',
                        'messageId': messageCount,
                        'humidity': err ? 0 : humidity.toFixed(1)
                    }));
                } else {
                    message = new Message(JSON.stringify({
                        'deviceId': 'raspi',
                        'messageId': messageCount,
                        'temperature': err ? null : temperature.toFixed(1),
                        'humidity': err ? 0 : humidity.toFixed(1)
                    }));
                }

                console.log('sending device-to-cloud message:');
                console.log('  body: ' + message.getData());

                client.sendEvent(message, printResultFor('send'));
            });
        }, 1000);

        client.on('error', function(err) {
            console.error(err.message);
        });

        client.on('disconnect', function() {
            clearInterval(sendInterval);
            lastCallbackMsgId = null;
            lastSendMsgId = null;
            initError = null;
            client.removeAllListeners();
            client.open(connectCallback);
        });
    }
};

client.open(connectCallback);

function printResultFor(op) {
    return function printResult(err, res) {
        if (err) console.log(op + ' error: ' + err.toString());
        if (res) {
            console.log(op + ' status: ' + res.constructor.name);
            lastCallbackMsgId = res.transportObj.messageId;
        }
    };
}