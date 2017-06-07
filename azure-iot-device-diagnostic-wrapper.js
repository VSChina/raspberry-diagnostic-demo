const util = require('util');

var _Client = require('azure-iot-device').Client;
var Protocol = require('azure-iot-device-mqtt').Mqtt;
var uuid = require('node-uuid');

var Client = function() {
    Client.super_.apply(this, arguments);
}

util.inherits(Client, _Client);

Client.fromConnectionString = function fromConnectionString() {
    var _client = Client.super_.fromConnectionString.apply(this, [arguments[0], Protocol]);
    if (typeof arguments[1] === 'function') {
        console.warn('Specific protocol is not supported, use MQTT.');
        arguments[1] = null;
    }
    var transport = _client._transport,
        connStr = _client._connectionString,
        blobUploadClient = _client.blobUploadClient;
    _client = null;
    var client = new Client(transport, connStr, blobUploadClient);
    client._diagnostic = arguments[1] || {};
    return client;
};

Client.prototype.open = function(done) {
    var _this = this;
    Client.super_.prototype.open.call(this, function(err) {
        if (!err) {
            _this.getTwin(function(err, twin) {});
        }
        done(err);
    });
};

Client.prototype.sendEvent = function(msg, sendEventCallback) {
    if (this.isSendDiagnostic()) {
        msg.properties.add('x-correlation-id', uuid());
        msg.properties.add('x-before-send-request', new Date().toISOString());
        msg.properties.add('x-version', '0.1.0');
    }
    Client.super_.prototype.sendEvent.call(this, msg, sendEventCallback);
};

Client.prototype.isSendDiagnostic = function() {
    if (!this._diagnostic.diagEnable) {
        return false;
    }

    var sampleRate = 0;

    if (this._diagnostic.samplingRateSource === 'device' && !isNaN(this._diagnostic.samplingRatePercentage)) {
        sampleRate = Number(this._diagnostic.samplingRatePercentage);
    } else if (!isNaN(this._diagnostic.diagSampleRate)) {
        sampleRate = Number(this._diagnostic.diagSampleRate);
    }

    if (sampleRate === 0) {
        return false;
    }

    if (sampleRate === 100) {
        return true;
    }

    if (this._diagnostic.samplingStrategy !== 'time') {
        return (Math.random() * 100 < sampleRate);
    } else {
        this._diagnostic.msgIndex = this._diagnostic.msgIndex || 0;
        this._diagnostic.msgIndex++;
        this._diagnostic.msgIndex %= 1000;
        return Math.round(Math.round(this._diagnostic.msgIndex * sampleRate / 100) * 100 / sampleRate) === this._diagnostic.msgIndex;
    }
};

Client.prototype.getTwin = function(done, twin) {
    var _this = this;
    Client.super_.prototype.getTwin.call(this, function(err, twin) {
        if (!err) {
            twin.prependListener('properties.desired', function(delta) {
                if (delta['diag_enable'] !== undefined) {
                    _this._diagnostic.diagEnable = delta['diag_enable'];
                    if (_this._diagnostic.diagEnable.toString() === "true") {
                        _this._diagnostic.diagEnable = true;
                    } else {
                        _this._diagnostic.diagEnable = false;
                    }
                    console.log(_this._diagnostic.diagEnable);
                    delete delta['diag_enable'];
                }

                if (delta['diag_sample_rate'] !== undefined) {
                    _this._diagnostic.diagSampleRate = delta['diag_sample_rate'];
                    delete delta['diag_sample_rate'];
                }
            });
        }

        done(err, twin);
    });
};

module.exports = {
    Client: Client
};