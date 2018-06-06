var crc = require('crc');

/**
 * Available commands
 */ 
Message.commands = {
  //LOGIN                           : "20",
  HEARTBEAT                       : "HB",
  SET_SILENT_ALARM                : "CO",
  //REQUEST_REPORT                  : "01",

  GET_SN_IMEI                     : 0x9001,
  RESET_CONFIGURATION             : 0x4110,
  REBOOT_GPS                      : 0x4902,
  SET_EXTENDED_SETTINGS           : 0x4108,
  SET_HEARTBEAT_INTERVAL          : 0x5199,
  CLEAR_MILEAGE                   : 0x4351,
  SET_POWER_DOWN_TIMEOUT          : 0x4126,

  GET_MEMORY_REPORT               : 0x9016,
  SET_MEMORY_REPORT_INTERVAL      : 0x4131,
  CLEAR_MEMORY_REPORTS            : 0x5503,
  
  GET_AUTHORIZED_PHONE            : 0x9003,
  SET_AUTHORIZED_PHONE            : 0x4103,
  
  GET_REPORT_TIME_INTERVAL        : 0x9002,
  SET_REPORT_TIME_INTERVAL        : "02",
  SET_REPORT_DISTANCE_INTERVAL    : 0x4303,

  SET_ALARM_SPEEDING              : 0x4105,
  SET_ALARM_MOVEMENT              : 0x4106,
  SET_ALARM_GEOFENCE              : 0x4302,
  
  REPORT                          : "PA", // sent by tracker
  ALARM                           : 0x9999, // sent by tracker
};

/** 
 * Message types
 */
Message.types = {
  REPORT_POWER_ON         : 0x14,
  REPORT_BY_TIME          : 0x9955,
  REPORT_BY_DISTANCE      : 0x63,
  REPORT_BLIND_AREA_START : 0x15,
  REPORT_BLIND_AREA_END   : 0x16,
  REPORT_DIRECTION_CHANGE : 0x52,
  
  ALARM_SOS_PRESSED       : 0x01,
  ALARM_SOS_RELEASED      : 0x31,
  ALARM_LOW_BATTERY       : 0x10,
  ALARM_SPEEDING          : 0x11,
  ALARM_MOVEMENT          : 0x12, // movement & geo-fence
};

/**
 * Message prefixes
 */
Message.PREFIX_CLIENT = '$$';
Message.PREFIX_SERVER = '@@';

/**
 * Available modes
 */
Message.MODE_NORMAL   = 0;
Message.MODE_RAW_DATA  = 1;

/**
 * Constructor
 * @param {object} options
 *  
 * Available options:
 * - trackerId
 * - command
 * - data
 * - prefix
 * - mode
 */
function Message(options) {

  /**
   * @var {number}
   */
  this.trackerId = 0;

  /**
   * @var {string}
   */
  this.command = '';

  /**
   * @var {mixed}
   */
  this.data = null;

  /**
   * @var {string}
   */
  this.raw = '';

  /**
   * @var {boolean}
   */
  this.isRequest = false;

  /**
   * @var {number}
   */
  this.pin = 0;

  // Fill in properties
  if (typeof options === 'object') {
    for (var key in options) {
      if (typeof this[key] !== 'undefined') {
        this[key] = options[key];
      }
    }
  }
}

/**
 * Creates message using buffer
 * @param {Buffer} buffer
 * @return {Message|boolean}
 */
Message.createFromBuffer = function(buffer) {
  var str = buffer.toString();
  var data = str.split("$");
  var imei = data[1].split("#")[0];
  var command = data[0];

  if (data.length < 2 || command.length !== 2) {
    return {
      invalid: true,
      raw: str
    };
  }

  // Parse & return message
  return new Message({
    trackerId: imei,
    command: command,
    data: data,
    raw: str
  });
};

/**
 * Returns command name using specified code
 * @param {number} code
 * @return {string|boolean}
 */
Message.getCommandNameByCode = function(code) {
  for (var key in Message.commands) {
    if (Message.commands[key] === code) {
      return key;
    }
  }
  return false;
}

/**
 * Returns response command code for specified request command code
 * @param {number} code
 * @return {number}
 */
Message.resolveCommand = function(code) {
  switch (code) {
    case Message.commands.REQUEST_REPORT:
      return Message.commands.REPORT;

    case Message.commands.SET_REPORT_TIME_INTERVAL:
      return Message.commands.SET_REPORT_TIME_INTERVAL_RESULT;

    default:
      return code;
  }
}

/**
 * Returns message type by specified code
 * @param {number} code
 * @return {string|boolean}
 */
Message.getMessageTypeByCode = function(code) {
  for (var key in Message.types) {
    if (Message.types[key] === code) {
      return key;
    }
  }
  return false;
}

/**
 * Parses message data
 * @param {string} code
 * @param {string} data
 * @return {mixed}
 */
Message.parseData = function(code, data) {
  data = data[1].split("#");
  var parsed = {
    imei: data[0]
  };

  /**
   * Parses data (coordinates)
   * @param {string} data
   * @return {object}
   */
  function parseCoords(data) {

    // Retrieve date & time
    var date = new Date(Date.UTC('20' + data[1].substring(4, 6),
                    data[1].substring(2, 4) -1,
                    data[1].substring(0, 2),
                    data[2].substring(0, 2),
                    data[2].substring(2, 4),
                    data[2].substring(4, 6)));
    
    var lat = parseFloat(data[3]);
    var lng = parseFloat(data[4]);

    return {
      date             : isNaN(date.getTime()) ? null: date,
      latitude         : isNaN(lat) ? null : lat,
      longitude        : isNaN(lng) ? null : lng,
      // speed         : parseFloat(part1[6]),
      // heading       : parseFloat(part1[7]),
      // hdop          : parseFloat(part2[1]),
      // altitude      : parseFloat(part2[2]),
      // ioStatus      : part2[3],
      // analogInput   : part2[4].split(','),
      // baseStationId : part2[5],
      // csq           : parseFloat(part2[6]),
      // journey       : parseInt(part2[7], 10),
      // gpsValid      : part1[1] === 'A' ? true : false,
    };
  }

  // Use correct format for each command
  switch (code) {
      
    // case Message.commands.GET_SN_IMEI:
    //   var data = buffer.toString('ascii').split(',');
    //   return {
    //     sn   : data[0],
    //     imei : data[1],
    //   };
    
    // case Message.commands.GET_REPORT_TIME_INTERVAL:
    //   return parseInt(buffer.toString('hex'), 16);
    
    // case Message.commands.GET_MEMORY_REPORT:
    //   // Is parsed at Tracker.getMemoryReports
    //   break;
        
    // case Message.commands.GET_AUTHORIZED_PHONE:
    //   var hex = buffer.toString('hex');
      
    //   var phones = {
    //     sms  : hex.substring(0, 32),
    //     call : hex.substring(32, 64),
    //   }
      
    //   for (var i in phones) {
    //     while (phones[i].slice(-1) === '0') phones[i] = phones[i].substring(0, phones[i].length - 1);
    //     phones[i] = new Buffer(phones[i], 'hex').toString('ascii');
    //   }
    //   return phones;
    
    // case Message.commands.RESET_CONFIGURATION:
    // case Message.commands.REBOOT_GPS:
    // case Message.commands.SET_EXTENDED_SETTINGS:
    // case Message.commands.CLEAR_MEMORY_REPORTS:
    // case Message.commands.CLEAR_MILEAGE:
    // case Message.commands.SET_POWER_DOWN_TIMEOUT:
    // case Message.commands.SET_HEARTBEAT_INTERVAL:
    // case Message.commands.SET_AUTHORIZED_PHONE:
    // case Message.commands.SET_MEMORY_REPORT_INTERVAL:
    // case Message.commands.SET_ALARM_SPEEDING:
    // case Message.commands.SET_ALARM_MOVEMENT:
    // case Message.commands.SET_ALARM_GEOFENCE:
    // case Message.commands.SET_REPORT_DISTANCE_INTERVAL:
    //   return !!parseInt(buffer.toString('hex'), 16);
    
    // case Message.commands.SET_REPORT_TIME_INTERVAL_RESULT:
    //   return !!parseInt(buffer.toString('hex').substring(0, 2), 16);

    case Message.commands.REPORT:
      data = parseCoords(data);
    
    // case Message.commands.ALARM:
    //   return {
    //     type : parseInt(buffer.toString('hex').substring(0, 2), 16),
    //     data : parseCoords(new Buffer(buffer.toString('hex').substring(2), 'hex').toString('ascii')),
    //   };
  }

  Object.assign(parsed, data);
  return parsed;
}

/**
 * Returns compact string representation,
 * useful for debugging
 * @return {string}
 */
Message.prototype.toString = function() {
  return (this.prefix === Message.PREFIX_SERVER ? 'server' : 'client') + ' '
       + '#' + this.trackerId + ' '
       + Message.getCommandNameByCode(this.command) + ' '
       + this.data;
};

/**
 * Returns encoded message as Buffer
 * @return {Buffer}
 */
Message.prototype.toBuffer = function() {
  var result = [this.command + "$" + (this.isRequest ? this.pin : this.trackerId)]
    .concat(this.data)
    .join("#");
  
  return new Buffer(result);
};

module.exports = Message;
