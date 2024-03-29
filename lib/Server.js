var EventEmitter = require('events').EventEmitter;
var extend       = require('extend');
var net          = require('net');
var Tracker      = require(__dirname + '/Tracker');
var util         = require("util");

/**
 * Constructor
 * @param {object} options
 */
var Server = module.exports = function(options) {

  /**
   * Configuration
   * @var {object}
   */
  this.config = extend({timeout: 120000}, options);

  /**
   * Connected trackers
   * @var array
   */
  this.trackers = [];

  /**
   * Server, listening for connections
   * @var {net.Server}
   */
  this.tcpServer;

  // Link to current object instance
  var server = this;

  // Configure net.Server
  this.tcpServer = net.createServer(this.config.serverOptions || {}, function(connection) {
    var tracker = new Tracker(connection, {timeout: server.config.timeout});

    tracker.on('disconnect', function(params) {
      if (!params) params = {};
      for (var i in server.trackers) {
        if (server.trackers[i] == tracker) {
          tracker.disconnect();
          if (!params.silent) {
            server.emit('disconnect', tracker);
          }
          delete server.trackers[i];
        }
      }
    });

    tracker.on('error', function(error) {
      server.emit('error', error);
    });

    server.trackers.push(tracker);
    server.emit('connect', tracker);
  });

  this.tcpServer.on('error', function(error) {
    server.emit('error', error);
  });
}
util.inherits(Server, EventEmitter);

/**
 * Binds to the specific port
 * @param {number} port
 * @param {function} callback
 */
Server.prototype.listen = function(port, callback) {
  this.tcpServer.listen(port, callback);
  return this;
};
