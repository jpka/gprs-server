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
            longitude: 113.82682
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
        longitude: null
    });
    t.end();
  });
  t.context.socket.write("PA$IMEI#DDMMAA#171229#Latitud#Longitud#999#360#9999#39#122#12#XXXX");
});

test.cb("triggers error and displays original payload when failed to parse a message", t => {
    t.context.tracker.on("error", (error, buffer) => {
        t.is(buffer.toString(), "21321sdsad/(&%&%/)0x8766");
        t.end();
    });
    t.context.socket.write("21321sdsad/(&%&%/)0x8766");
});

test.cb("enables silent alarm", t => {
    t.context.heartbeat(() => {
        t.context.socket.on("data", data => {
            t.is(data.toString(), `CO$${t.context.pin1}#S1`);
            t.context.socket.write(`CO$${t.context.imei1}#S1`);
        });
        t.context.tracker.setSilentAlarm(true, (err) => {
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
      t.context.tracker.setSilentAlarm(false, (err) => {
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
      t.context.tracker.setSilentAlarm(false, (err) => {
          t.truthy(err);
          t.true(err.message.indexOf(answer) > -1);
          t.end();
      });
  });
});

test.cb("request queue works with silent alarm set", t => {
    t.context.tracker.setSilentAlarm(true, (err) => {
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

test.cb("handles status reports with no data", t => {
  t.context.tracker.on("report", data => {
    t.deepEqual(data.data, {
        imei: null,
        date: null,
        latitude: null,
        longitude: null
    });
    t.end();
  });
  t.context.socket.write("PA$");
});

// test.cb("sets up timed reports and report success", t => {
//     t.context.login(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), "PA$2$02$1#00000A$AP");
//             t.context.socket.write("PA$353990030327618$2$02$AP");
//         });
//         t.context.tracker.setReportTimeInterval("00:00:10", (err, result) => {
//             if (err) throw err;
            
//             t.is(result, "success");
//             t.end();
//         });
//     });
// });

// test.cb("disables timed reports and report success", t => {
//     t.context.login(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), "PA$2$02$0#000000$AP");
//             t.context.socket.write("PA$353990030327618$2$02$AP");
//         });
//         t.context.tracker.setReportTimeInterval("00:00:00", (err, result) => {
//             if (err) throw err;
            
//             t.is(result, "success");
//             t.end();
//         });
//     });
// });

// test.cb("queries gps location correctly", t => {
//     t.context.tracker.requestReport("gps", (err, data) => {
//         if (err) {
//             throw err;
//         }
//         t.is(data, {

//         });
//         t.end();
//     });
// });

// test.cb("handles requested gps report correctly", t => {
//     t.context.tracker.requestReport("gps", (err, data) => {
//         if (err) {
//             throw err;
//         }
//         t.is(data, "PA$13400010001$1$01$091117#020928#1#22.537222#114.020948#0.00#0.0#42.1#4183#011#8#011#Wsz-wl001#B0101940#C+3.0,-5.0,+2.0$AP");
//         t.end();
//     });
// });