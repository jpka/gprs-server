import test from "ava";
import Server from "../lib/Server";
import {Socket} from "net";

test.beforeEach.cb(t => {
    t.context.server = (new Server()).listen(20180, function(error) {
        if (error) {
            throw error;
        }
        console.log("server listening");
    });
    t.context.server.on("connect", tracker => {
        t.context.tracker = tracker;
        t.pass("connection established");
        t.end();
    });
    t.context.socket = new Socket();
    t.context.socket.connect(20180);

    t.context.imei1 = 353990030327618;
    t.context.pin1 = 22672;
    t.context.heartbeat = (cb) => t.context.socket.write(`HB$${t.context.imei1}#22`, "utf8", () => {
        if (cb) {
            t.context.socket.on("data", data => {
              if (data.toString() === `HB$${t.context.imei1}#21`) cb();
            });
        }
    });
    // t.context.heartbeat = (cb) => t.context.socket.write(`HB$${t.context.imei1}#22`, "utf8", cb);
});

test.afterEach.cb(t => {
    t.context.server.tcpServer.on('close', () => {
        console.log('server closed');
        t.end();
    });
    t.context.server.tcpServer.close();
    t.context.socket.end();
    t.context.tracker.disconnect();
});

// test.cb("recognizes device login", t => {
//     t.context.tracker.on("login", function() {
//         t.pass();
//         t.end();
//     });
//     t.context.login();
// });

// test.cb("responds to device login", t => {
//     t.context.socket.on("data", data => {
//         t.is(data.toString(), "PA$353990030327618$20$AP");
//         t.end();
//     }); 
//     t.context.login();
// });

test.cb("recognizes heartbeat", t => {
    t.context.tracker.on("heartbeat", () => {
        t.pass();
        t.end();
    });
    t.context.heartbeat();
});

test.cb("responds to heartbeat", t => {
    t.context.socket.on("data", function(data){
        t.is(data.toString(), "HB$353990030327618#21");
        t.end();
    });
    t.context.heartbeat();
});

test.cb("handles status reports", t => {
    t.context.tracker.on("report", data => {
        t.deepEqual(data.data, {
            imei: "353990030327618",
            date: new Date("2018-10-01T13:30:15.000Z"),
            latitude: 22.64611,
            longitude: 113.82682,
            speed: 120,
            heading: 115,
            altitude: 85,
            internalBattery: 3.8,
            vehicleBattery: 12.1,
            gsmSignal: 25,
            gpsSatellites: 8,
            vehicleContact: false,
            accelerometer: false,
            energySavings: false,
            externalFeed: true,
            gpsState: false,
            systemArmed: false,
            engineCut: true,
            siren: false,
            ain2: false,
            din1: false,
            din2: false,
            din3: true,
            din4: true
        });
        t.end();
    });
    t.context.socket.write("PA$353990030327618#011018#133015#+22.64611#+113.82682#120#115#085#38#121#25#8#121812");
});

test.cb("handles status reports with invalid data", t => {
  t.context.tracker.on("report", data => {
    t.deepEqual(data.data, {
        imei: "IMEI",
        date: null,
        latitude: null,
        longitude: null,
        speed: null,
        heading: null,
        altitude: null,
        internalBattery: null,
        vehicleBattery: null,
        gsmSignal: null,
        gpsSatellites: null,
        vehicleContact: null,
        accelerometer: null,
        energySavings: null,
        externalFeed: null,
        gpsState: null,
        systemArmed: null,
        engineCut: null,
        siren: null,
        ain2: null,
        din1: null,
        din2: null,
        din3: null,
        din4: null
    });
    t.end();
  });
  t.context.socket.write("PA$IMEI#DDMMAA#dsad#Latitud#Longitud#asds#asdsa#asdasd#dasd#sds#xx#XXXX");
});

test.cb("triggers error and displays original payload when failed to parse a message", t => {
    t.context.tracker.on("error", (error, buffer) => {
        t.is(buffer.toString(), "21321sdsad/(&%&%/)0x8766");
        t.end();
    });
    t.context.socket.write("21321sdsad/(&%&%/)0x8766");
});

test.cb("handles status reports with no data", t => {
  t.context.tracker.on("report", data => {
    t.deepEqual(data.data, {
        imei: null,
        date: null,
        latitude: null,
        longitude: null,
        speed: null,
        heading: null,
        altitude: null,
        internalBattery: null,
        vehicleBattery: null,
        gsmSignal: null,
        gpsSatellites: null,
        vehicleContact: null,
        accelerometer: null,
        energySavings: null,
        externalFeed: null,
        gpsState: null,
        systemArmed: null,
        engineCut: null,
        siren: null,
        ain2: null,
        din1: null,
        din2: null,
        din3: null,
        din4: null
    });
    t.end();
  });
  t.context.socket.write("PA$");
});

test.cb("enables silent alarm", t => {
    t.context.heartbeat(() => {
        t.context.socket.on("data", data => {
            t.is(data.toString(), `CO$${t.context.pin1}#S1`);
            t.context.socket.write(`CO$${t.context.imei1}#S1`);
        });
        t.context.tracker.setFlag("silent alarm", true, (err) => {
            t.is(err, null);
            t.end();
        });
    });
});

test.cb("disables silent alarm", t => {
  t.context.heartbeat(() => {
      t.context.socket.on("data", data => {
          t.is(data.toString(), `CO$${t.context.pin1}#S0`);
          t.context.socket.write(`CO$${t.context.imei1}#S0`);
      });
      t.context.tracker.setFlag("silent alarm", false, (err) => {
          t.is(err, null);
          t.end();
      });
  });
});

test.cb("silent alarm set throws error if response was incorrect", t => {
  let answer = `CO$${t.context.imei1}#asdsad`;
  t.context.heartbeat(() => {
      t.context.socket.on("data", data => {
          t.is(data.toString(), `CO$${t.context.pin1}#S0`);
          t.context.socket.write(answer);
      });
      t.context.tracker.setFlag("silent alarm", false, (err) => {
          t.truthy(err);
          t.true(err.message.indexOf(answer) > -1);
          t.end();
      });
  });
});

test.cb("request queue works with silent alarm set", t => {
    t.context.tracker.setFlag("silent alarm", true, (err) => {
        t.is(err, null);
        t.end();
    });
    setTimeout(() => {  
      t.context.socket.on("data", data => {
        t.true(data.toString().indexOf(`CO$${t.context.pin1}#S1`) > -1);
        t.context.socket.write(`CO$${t.context.imei1}#S1`);
      });
      t.context.heartbeat();
    }, 1000);
});