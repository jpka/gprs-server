var EventEmitter = require('events').EventEmitter;
var extend       = require('extend');
var Message      = require(__dirname + '/Message');
var Queue        = require(__dirname + '/Queue');
var util         = require("util");

/**
 * Available statuses
 */
Tracker.STATUS_NOT_LOGGED_IN = 0;
Tracker.STATUS_WAITING = 1;
Tracker.STATUS_WORKING = 2;    

/**
 * Constructor
 * @param {net.Socket} connection
 * @param {object} options
 */
function Tracker(connection, options) {

  /**
   * Configuration
   * @var {object}
   */
  this.config = extend({timeout: 120000}, options);

  /**
   * Unique tracker identifier
   * @var {number}
   */
  this.trackerId = 0;

  /**
   * Status
   * @var {number}
   */
  this.status = Tracker.STATUS_NOT_LOGGED_IN;

  /**
   * Tracker connection
   * @var {net.Socket}
   */
  this.connection = connection;

  /**
   * Requests queue
   * @var {array}
   */
  this.queue = new Queue();

  /**
   * Processes current queue request
   */
  this.processQueue = function(reverse) {
    var current = reverse ? this.queue.pending[this.queue.pending.length-1] : this.queue.getCurrent();
    current = current.message;
    current.trackerId = this.trackerId;
    current.pin = this.pin;
    this.send(current);
    this.status = Tracker.STATUS_WORKING;
  }

  this.clearQueue = function() {
    this.queue = new Queue();
  }

  // Link to current object instance
  var tracker = this;

  // Handle data
  this.connection.on('data', function(buffer) {
    // Parse message
    var message = Message.createFromBuffer(buffer);

    // Emit incoming message event
    tracker.emit('packet.in', message);

    if (message.invalid) {
      tracker.emit('error', new Error('Error parsing message'), buffer);
      return;
    }

    // Assign trackerId, if unset
    if (!tracker.trackerId && message.trackerId) {
      tracker.trackerId = parseInt(message.trackerId);
      //calculate security pin on imei set, no need to do it every time
      var imeiPart = tracker.trackerId.toString().substring(tracker.trackerId.toString().length - 9);
      tracker.pin = (imeiPart % 575) * (imeiPart % 306);
    }

    // Handle login command
    if (message.command === Message.commands.LOGIN) {
      tracker.send(new Message({
        command : Message.commands.LOGIN
      }));
      tracker.emit('login');
    } else if (message.command === Message.commands.HEARTBEAT) {
      tracker.send(new Message({
        command : Message.commands.HEARTBEAT,
        data: [21]
      }));

      tracker.emit('heartbeat');

      // Set state as ready after initial heartbeat
      if (tracker.status === Tracker.STATUS_NOT_LOGGED_IN) {
        tracker.status = Tracker.STATUS_WAITING;
      }
    }

    // Handle pending requests
    if (tracker.queue.getCurrent().responseCommand === message.command) {
      tracker.queue.resolveCurrent(message);
      if (tracker.queue.isEmpty()) {
        tracker.status = Tracker.STATUS_WAITING;
      }
    }

    // Handle reports & alarms
    if (message.command === Message.commands.REPORT) {
      tracker.emit('report', {
        // type : Message.types.REPORT_BY_TIME,
        data : Message.parseData(Message.commands.REPORT, message.data),
        raw  : message.raw
      });
    } 

    if (message.command === Message.commands.ALARM) {
      var parsed = Message.parseData(Message.commands.ALARM, message.data);

      tracker.send(new Message({
        command : Message.commands.ALARM,
        data: [1, parsed.type]
      }), {
        omitId: true
      });

      tracker.emit('alarm', {
        type: ({
          "SG": "accelerometer",
          "CB": "external battery cut",
          "EB": "external battery low",
          "LB": "internal battery low",
          "A": "accident",
          "N1": "DIN1",
          "N2": "DIN2"
        })[parsed.type],
        data: parsed.data,
        raw: message.raw
      });
    }
  });

  // Handle disconnects
  this.connection.on('close', function() {
    console.log("disconnection test " + tracker.trackerId);
    connection.write(new Buffer("CO#" + tracker.pin + "#LB", "ascii") + "\r");
  });

  // Handle errors
  this.connection.on('error', function(error) {
    tracker.emit('error', error);
    if (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED") {
      tracker.emit("disconnect");
    }
  });

  // Set connection timeout
  if (this.config.timeout > 0) {
    this.connection.setTimeout(this.config.timeout, function() {
      tracker.emit('timeout');
      tracker.disconnect();
    });
  }

  // connection.setKeepAlive(true);
}

util.inherits(Tracker, EventEmitter);
module.exports = Tracker;

/**
 * Sends specified message to connected device,
 * sets message.trackerId, if missing
 * @param {Message} message
 */
Tracker.prototype.send = function(message, options) {
  options = options || {};

  // Set trackerId, if missing
  if (!message.trackerId) {
    message.trackerId = this.trackerId;
  }
  if (!message.pin) {
    message.pin = this.pin;
  }

  // Emit outgoing message event
  this.emit('packet.out', message);

  // Send message to device
  try {
    this.connection.write(message.toBuffer(options));
  } catch (e) {
    this.emit('error', e);
  }
}

/**
 * Adds message to queue. 
 * Replaces trackerId to device's correct one.
 * Executes only 1 command at one time
 * @param {number} command
 * @param {mixed} data
 * @param {function} callback
 * @return {boolean}
 */
Tracker.prototype.request = function(message, callback, force) {

  // Add to the end of queue
  message.isRequest = true;

  // If currently nothing is being executed - process request
  if (this.status === Tracker.STATUS_WAITING) {
    this.queue.push(message, callback);
    this.processQueue(force);
  } else if (force) {
    // set a little delay between consecutive messages so as to not send the messages mashed together
    var tracker = this;
    setTimeout(function() {
      tracker.queue.push(message, callback);
      tracker.processQueue(force);
    }, 500);
  }

  return true;
};

/**
 * Disconnects tracker
 * @return {boolean}
 */
Tracker.prototype.disconnect = function() {
  if (!this.connection.destroyed) {
    this.connection.destroy();
    return true;
  }
  return false;
};

/**
 * Request tracker to send location report
 */
Tracker.prototype.requestReport = function() {
  setTimeout(() => {
    this.send(new Message({
      command: Message.commands.SERVER_COMMAND, 
      data: ["LB"],
      isRequest: true
    }));
  }, 500);
};

/**
 * Sets device flag
 * @param {string} flagName
 * @param {boolean} enable
 * @param {function} callback
 */
Tracker.prototype.setFlag = function(flagName, enable, callback) {
  var prefix;
  var dataBit;

  switch (flagName) {
    case "alarm armed":
      prefix = "S";
      break;
    case "engine cut":
      prefix = "M";
      break;
    case "energy savings":
      prefix = "A";
      break;
    case "maintenance mode":
      prefix = "N";
      break;
    case "siren":
      prefix = "AS";
      break;
  }

  dataBit = enable ? prefix + "1" : prefix + "0";

  this.request(new Message({
    command: Message.commands.SERVER_COMMAND, 
    data: [dataBit]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    // callback(null, Message.parseData(Message.commands.SET_ALARM_MOVEMENT, new Buffer(response.data)));
    if (response.raw === Message.commands.SERVER_COMMAND + "$" + response.trackerId + "#" + dataBit) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Sets accelerometer sensibility
 * @param {number} value
 * @param {function} callback
 */
Tracker.prototype.setAccelerometerSensibility = function(value, callback) {
  this.request(new Message({
    command: Message.commands.SERVER_COMMAND, 
    data: ["AC" + value]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.SERVER_COMMAND + "$" + response.trackerId + "#AC" + value) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Sets battery alarm threshold
 * @param {number} value
 * @param {function} callback
 */
Tracker.prototype.setBatteryAlarmThreshold = function(value, callback) {
  value = value.toString().replace(/\./g, "");
  if (value.length == 2) {
    value += "0";
  }

  this.request(new Message({
    command: Message.commands.SERVER_COMMAND, 
    data: ["B" + value]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.SERVER_COMMAND + "$" + response.trackerId + "#B" + value) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};


/**
 * Requests partial reset
 * @param {function} callback
 */
Tracker.prototype.doPartialReset = function(callback) {
  this.request(new Message({
    command: Message.commands.SERVER_COMMAND, 
    data: ["V"]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.SERVER_COMMAND + "$" + response.trackerId + "#V") {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
}; 

/**
 * Requests factory reset
 * @param {function} callback
 */
Tracker.prototype.doFactoryReset = function(callback) {
  this.request(new Message({
    command: Message.commands.SERVER_COMMAND, 
    data: ["Z"]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.SERVER_COMMAND + "$" + response.trackerId + "#Z") {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Delete device firmware
 * @param {function} callback
 */
Tracker.prototype.deleteFirmware = function(callback) {
  this.request(new Message({
    command: Message.commands.FIRMWARE_DELETE, 
    data: []
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.FIRMWARE_DELETE + "$" + response.trackerId + "#1") {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Update device firmare
 * @param {function} callback
 */
Tracker.prototype.updateFirmware = function(callback) {
  this.request(new Message({
    command: Message.commands.FIRMWARE_UPDATE, 
    data: []
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === Message.commands.FIRMWARE_UPDATE + "$" + response.trackerId) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Read firmware record
 * @param {string} address
 * @param {function} callback
 */
Tracker.prototype.readFirmwareRecord = function(address, callback) {
  var tracker = this;
  this.request(new Message({
    command: Message.commands.FIRMWARE_RECORD_READ, 
    data: [address]
  }), function(error, response) {
    var data;
    if (error) {
      callback(error);
      return;
    }

    try {
      data = Message.parseData(Message.commands.FIRMWARE_RECORD_READ, response.data);
      if (
        response.data[0] === Message.commands.FIRMWARE_RECORD_READ && 
        data.imei == tracker.trackerId
      ) {
        callback(null, data.recordData);
      } else {
        throw new Error();
      }
    } catch (e) {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Write firmware record
 * @param {string} address
 * @param {function} callback
 */
Tracker.prototype.writeFirmwareRecord = function(address, data, checksum, callback) {
  var tracker = this;
  this.request(new Message({
    command: Message.commands.FIRMWARE_RECORD_WRITE, 
    data: [address, data, checksum]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === `${Message.commands.FIRMWARE_RECORD_WRITE}$${tracker.trackerId}#${address}#1`) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/**
 * Send firmware start address
 * @param {string} address
 * @param {function} callback
 */
Tracker.prototype.sendFirmwareStartLinearAddress = function(address, callback) {
  var tracker = this;
  this.request(new Message({
    command: Message.commands.FIRMWARE_START_LINEAR_ADDRESS, 
    data: [address]
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }

    if (response.raw === `${Message.commands.FIRMWARE_START_LINEAR_ADDRESS}$${tracker.trackerId}`) {
      callback(null);
    } else {
      callback(new Error("Tracker responded incorrectly: " + response.raw));
    }
  }, true);
};

/* Everything below this point is the meiligao legacy implementation, unadapted */

/**
 * Retrieves sn & imei codes from tracker
 * @param {function} callback
 */
Tracker.prototype.getSnImei = function(callback) {
  this.request(new Message({command: Message.commands.GET_SN_IMEI}), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.GET_SN_IMEI, new Buffer(response.data)));
  }); 
};

/**
 * Makes all settings (except for the password, ip, port, apn, id & gprs interval)
 * back to the factory default
 * @param {function} callback
 */
Tracker.prototype.resetConfiguration = function(callback) {
  this.request(new Message({command: Message.commands.RESET_CONFIGURATION}), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.RESET_CONFIGURATION, new Buffer(response.data)));
  });
};

/**
 * Reboots GPS module on the tracker
 * back to the factory default
 * @param {function} callback
 */
Tracker.prototype.rebootGps = function(callback) {
  this.request(new Message({command: Message.commands.REBOOT_GPS}), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.REBOOT_GPS, new Buffer(response.data)));
  });
};

/**
 * Sets extended settings
 * @param {object} options
 * @param {function} callback
 */
Tracker.prototype.setExtendedSettings = function(options, callback) {

  // Merge with defaults
  var params = extend({
    smsReplyOnCall    : true,
    useGPRMSFormat    : false,
    hangUpAfter5Rings : false,
    enableCallBuzzer  : false,
    enableLedLights   : true,
    alarmPowerOn      : true,
    alarmPowerCut     : false,
    alarmGpsBlindArea : false,
  }, options);

  // Validate input
  for (var key in params) {
    if (typeof params[key] !== 'boolean') {
      callback(new Error('Bad "' + key + '" value given, boolean expected'));
      return; 
    }
  }

  // Prepare data
  var data = '0' + (~~params.smsReplyOnCall).toString(10)
           + '0' + (~~params.useGPRMSFormat).toString(10)
           + '0' + (~~params.hangUpAfter5Rings).toString(10)
           + '0' + (~~params.alarmPowerOn).toString(10)
           + '01' // reserved
           + '0' + (~~params.alarmGpsBlindArea).toString(10)
           + '0' + (~~!params.enableLedLights).toString(10)
           + '00' // reserved
           + '0' + (~~params.alarmPowerCut).toString(10)
           + '0' + (~~params.enableCallBuzzer).toString(10);

  // Perform request
  this.request(new Message({
    command : Message.commands.SET_EXTENDED_SETTINGS,
    data    : data,
    mode    : Message.MODE_RAW_DATA,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_EXTENDED_SETTINGS, new Buffer(response.data)));
  });
};

/**
 * Sets specified heartbeat interval in minutes
 * @param {number|string} minutes
 * @param {function} callback
 */
Tracker.prototype.setHeartbeatInterval = function(minutes, callback) {

  // If string, convert to integer
  if (typeof minutes === 'string') {
    minutes = parseInt(minutes, 10);
  }
  
  // Validate value
  if (minutes < 0 || minutes > 65535) {
    callback(new Error('Bad value given: "' + minutes + '". Expected integer between 0, 65535'));
    return;
  }
  
  // Add to queue
  this.request(new Message({
    command : Message.commands.SET_HEARTBEAT_INTERVAL, 
    data    : minutes.toString(10)
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_HEARTBEAT_INTERVAL, new Buffer(response.data)));
  });
};

/**
 * Deletes total mileage 
 * @param {function} callback
 */
Tracker.prototype.clearMileage = function(callback) {
  this.request(new Message({command : Message.commands.CLEAR_MILEAGE}), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.CLEAR_MILEAGE, new Buffer(response.data)));
  });
};

/**
 * Sets inactivity timeout (in minutes), after which tracker will go to energy saving mode
 * Possible values: 0 - 99, 0 disables timeout.
 * @param {number|string} timeout
 * @param {function} callback
 */
Tracker.prototype.setPowerDownTimeout = function(timeout, callback) {

  if (typeof timeout === 'string') {
    timeout = parseInt(timeout, 10);
  }

  // Validate input
  if (timeout < 0 || timeout > 99) {
    callback(new Error('Bad value given: "' + timeout + '", expected integer between 0, 99'));
    return;
  }
  
  // Prepare data
  timeout = timeout.toString();
  if (timeout.length < 2) {
    timeout = '0' + timeout;
  }

  // Perform request
  this.request(new Message({
    command : Message.commands.SET_POWER_DOWN_TIMEOUT,
    data    : timeout
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_POWER_DOWN_TIMEOUT, new Buffer(response.data)));
  });
};

/**
 * Reads logged data
 * @param {function} callback
 */
Tracker.prototype.getMemoryReports = function(callback) {

  /**
   * Returns random int from interval
   * @param {number} min
   * @param {number} max
   * @return {number}
   */
  function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  var deviceRandom = randomIntFromInterval(0, 254).toString(16);
  if (deviceRandom.length < 2) {
    deviceRandom = '0' + deviceRandom;
  }

  var pcRandom = randomIntFromInterval(0, 254).toString(16);
  if (pcRandom.length < 2) {
    pcRandom = '0' + pcRandom;
  }

  var waypoints = 0;
  var reports   = [];
  var tracker   = this;

  /**
   * Reads next report
   * @param {Error} error
   * @param {Message} response
   */
  function readNextReport(error, response) {

    // Handle errors
    if (error) {
      callback(error);
      return;
    }

    // Retrieve hex data
    var hex = new Buffer(response.data).toString('hex');

    // Parse data
    deviceRandom  = hex.substring(0, 2);
    pcRandom      = hex.substring(2, 4);
    waypoints     = parseInt(hex.substring(4, 12), 10);
    report        = new Buffer(hex.substring(12), 'hex').toString();

    // Save received report
    if (waypoints > 0) {
      reports.push(report);
    }

    // If we have some more reports - retrieve them
    if (waypoints > 1) {
      tracker.request(new Message({
        command : Message.commands.GET_MEMORY_REPORT,
        data    : deviceRandom + pcRandom + '0001',
        mode    : Message.MODE_RAW_DATA,
      }), readNextReport);
    } else {
      callback(null, reports);
    }
  }

  // Perform first request
  this.request(new Message({
    command : Message.commands.GET_MEMORY_REPORT,
    data    : deviceRandom + pcRandom + '0001',
    mode    : Message.MODE_RAW_DATA,
  }), readNextReport);
};

/**
 * Sets interval for saving coordinates in memory, when internet is not available,
 * possible values: 1-65535, 0 - disable
 * @param {number|string} seconds
 * @param {function} callback 
 */
Tracker.prototype.setMemoryReportInterval = function(seconds, callback) {

  // If string, convert to integer
  if (typeof seconds === 'string') {
    seconds = parseInt(seconds, 10);
  }

  // Validate value
  if (seconds < 0 || seconds > 65535) {
    callback(new Error('Bad value given: "' + seconds + '". Expected integer between 0, 65535'));
    return;
  }

  this.request(new Message({
    command: Message.commands.SET_MEMORY_REPORT_INTERVAL, 
    data: seconds.toString(10),
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_MEMORY_REPORT_INTERVAL, new Buffer(response.data)));
  });
};

/**
 * Clears reports stored in memory
 * @param {function} callback
 */
Tracker.prototype.clearMemoryReports = function(callback) {
  this.request(new Message({command : Message.commands.CLEAR_MEMORY_REPORTS}), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.CLEAR_MEMORY_REPORTS, new Buffer(response.data)));
  });  
};

/**
 * Returns authorized phone numbers
 * @param {function} callback
 */
Tracker.prototype.getAuthorizedPhones = function(callback) { 
  this.request(new Message({
    command : Message.commands.GET_AUTHORIZED_PHONE, 
    data    : '01',
    mode    : Message.MODE_RAW_DATA,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.GET_AUTHORIZED_PHONE, new Buffer(response.data)));
  });
};

/**
 * Sets authorized phone for sos button, for receiving sms & calls
 * @param {number|string|null} smsPhone
 * @param {number|string|null} callPhone
 * @param {function} callback
 */
Tracker.prototype.setAuthorizedPhones = function(smsPhone, callPhone, callback) {

  // Prepare input
  if (typeof smsPhone === 'number') {
    smsPhone = smsPhone.toString(10);
  } else if (smsPhone === null) {
    smsPhone = '';
  }
  
  if (typeof callPhone === 'number') {
    callPhone = callPhone.toString(10);
  } else if (callPhone === null) {
    callPhone = '';
  }

  // Get phones hex codes
  var smsPhoneHex = new Buffer(smsPhone).toString('hex');
  while (smsPhoneHex.length < 32) {
    smsPhoneHex += '0';
  }

  var callPhoneHex = new Buffer(callPhone).toString('hex');
  while (callPhoneHex.length < 32) {
    callPhoneHex += '0';
  }

  this.request(new Message({
    command: Message.commands.SET_AUTHORIZED_PHONE, 
    data: '01' + smsPhoneHex + callPhoneHex,
    mode: Message.MODE_RAW_DATA,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_AUTHORIZED_PHONE, new Buffer(response.data)));
  });
};

/**
 * Retrieves reporting time interval from tracker, 1 unit = 10 seconds
 * @param {function} callback
 */
Tracker.prototype.getReportTimeInterval = function(callback) {
  this.request(new Message({command : Message.commands.GET_REPORT_TIME_INTERVAL}), function(error, response){
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.GET_REPORT_TIME_INTERVAL, new Buffer(response.data)));
  });
};

/**
 * Sets reporting time interval, 1 unit = 10 seconds
 * @param {string} interval
 * @param {function} callback
 */
Tracker.prototype.setReportTimeInterval = function(interval, callback) {
  interval = interval === "00:00:00" ? "0#000000" : "1#" + interval.split(":").map(part => {
    part = parseInt(part).toString(16).toUpperCase();
    if (part.length < 2) {
      part = "0" + part;
    }
    return part
  }).join("");

  this.request(new Message({
    command : Message.commands.SET_REPORT_TIME_INTERVAL, 
    data    : interval
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, response.command === Message.commands.SET_REPORT_TIME_INTERVAL ? "success" : "failure");
  });
};

/**
 * Set distance report as per pre-set interval.
 * Sends out alarm when the car is moving and stops sending the report when the car is stationary.
 * @param {number|string} meters
 * @param {function} callback
 */
Tracker.prototype.setReportDistanceInterval = function(meters, callback) {

  if (typeof meters === 'string') {
    meters = parseInt(meters, 10);
  }

  if (meters < 0 || meters > 4294967295) {
    callback(new Error('Bad value given: "' + meters + '". Expected integer between 0, 4294967295'));
    return;
  }

  this.request(new Message({
    command: Message.commands.SET_REPORT_DISTANCE_INTERVAL, 
    data: meters.toString(10),
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_REPORT_DISTANCE_INTERVAL, new Buffer(response.data)));
  });
};

/**
 * Sets speeding alarm, 1 unit = 10 kmph
 * @param {number|string} speed
 * @param {function} callback
 */
Tracker.prototype.setAlarmSpeeding = function(speed, callback) {

  if (typeof speed === 'string') {
    speed = parseInt(speed, 10);
  }
  
  if (speed < 0 || speed > 20) {
    callback(new Error('Bad value given: "' + speed + '". Expected integer between 0, 20'));
    return;
  }

  var data = speed.toString(16);
  if (data.length < 2) {
    data = '0' + data;
  }

  this.request(new Message({
    command: Message.commands.SET_ALARM_SPEEDING, 
    data: data,
    mode: Message.MODE_RAW_DATA,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_ALARM_SPEEDING, new Buffer(response.data)));
  });
}

/**
 * Sets movement alarm, for area values please see documentation
 * 0 - disable
 * @param {number|string} area
 * @param {function} callback
 * @todo area validation
 */
Tracker.prototype.setAlarmMovement = function(area, callback) {

  if (typeof area === 'string') {
    area = parseInt(area, 10);
  }

  var data = area.toString(16);
  if (data.length < 2) {
    data = '0' + data;
  }

  this.request(new Message({
    command: Message.commands.SET_ALARM_MOVEMENT, 
    data: data,
    mode: Message.MODE_RAW_DATA,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_ALARM_MOVEMENT, new Buffer(response.data)));
  });
}

/**
 * Sets geo-fence alarm
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radius
 * @param {function} callback
 * @todo area validation
 */
Tracker.prototype.setAlarmGeofence = function(latitude, longitude, radius, callback) {

  // Validate input
  if (typeof latitude !== 'number') {
    callback(new Error('Bad latitude given, number expected'));
    return;
  }    

  if (typeof longitude !== 'number') {
    callback(new Error('Bad longitude given, number expected'));
    return;
  }

  if (typeof radius !== 'number' || radius < 1 || radius > 4294967295) {
    callback(new Error('Bad radius given: "' + speed + '", expected integer between 1, 4294967295'));
    return;
  }

  /**
   * Stuffes specified string/number with zeroes, as defined in format
   * @param {number|string} value
   * @param {number} format
   * @return {string}
   */
  function stuffWithZeroes(value, format){

    if (typeof value === 'number') {
        value = value.toString();
    }

    var formatParts = format.split('.');
    var valueParts  = value.split('.');

    // Fill left part
    while (valueParts[0].length < formatParts[0].length) {
      valueParts[0] = '0' + valueParts[0];
    }

    // Fill right part
    if (typeof valueParts[1] === 'undefined') {
      valueParts[1] = '';
    }

    if (formatParts[1]) {
      while (valueParts[1].length < formatParts[1].length) {
        valueParts[1] += '0';
      }
    }

    var result = valueParts[0];
    if (valueParts[1]) {
      result += '.' + valueParts[1];
    }
    return result;
  }

  // Prepare data
  var data = stuffWithZeroes(latitude, '000.000000') + ','
           + stuffWithZeroes(longitude, '000.000000') + ','
           + radius + ',' + '1,1';

  // Perform request
  this.request(new Message({
    command: Message.commands.SET_ALARM_GEOFENCE, 
    data: data,
  }), function(error, response) {
    if (error) {
      callback(error);
      return;
    }
    callback(null, Message.parseData(Message.commands.SET_ALARM_GEOFENCE, new Buffer(response.data)));
  });
};
