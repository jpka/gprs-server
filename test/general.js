import test from "ava";
import Server from "../lib/Server";
import {Socket} from "net";

const examples = {
    reports: {
        complete: "PA$353990030327618#011018#133015#3717.322482#N#00603.235948#W#120#115#085#38#121#25#8#121812"
    }
};

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
    t.context.pin1 = 103752;
    t.context.heartbeat = (cb) => t.context.socket.write(`HB$${t.context.imei1}#22`, "utf8", () => {
        if (cb) {
            t.context.socket.on("data", data => {
              if (data.toString() === `HB$${t.context.imei1}#21\r`) cb();
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

// test.cb("recognizes heartbeat", t => {
//     t.context.tracker.on("heartbeat", () => {
//         t.pass();
//         t.end();
//     });
//     t.context.heartbeat();
// });

// test.cb("responds to heartbeat", t => {
//     t.context.socket.on("data", function(data){
//         t.is(data.toString(), "HB$353990030327618#21\r");
//         t.end();
//     });
//     t.context.heartbeat();
// });

// test.cb("handles status reports", t => {
//     const message = "PA$353990030327618#011018#133015#3717.322482#N#00603.235948#W#120#115#085#38#121#33#8#68";
//     t.context.tracker.on("report", data => {
//         t.is(data.raw, message);
//         t.deepEqual(data.data, {
//             imei: "353990030327618",
//             date: new Date("2018-10-01T13:30:15.000Z"),
//             latitude: 37.288708033333336,
//             longitude: -6.053932466666667,
//             speed: 120,
//             heading: 115,
//             altitude: 85,
//             internalBattery: 3.8,
//             vehicleBattery: 12.1,
//             gsmSignal: 100,
//             gpsSatellites: 8,
//             vehicleContact: false,
//             accelerometer: false,
//             energySavings: false,
//             externalFeed: true,
//             gpsState: false,
//             alarmArmed: true,
//             engineCut: true,
//             siren: false,
//             ain2: null,
//             din1: null,
//             din2: null,
//             din3: null,
//             din4: null
//         });
//         t.end();
//     });
//     t.context.socket.write(message);
// });

// test.cb("handles status reports with invalid data", t => {
//   t.context.tracker.on("report", data => {
//     t.deepEqual(data.data, {
//         imei: "IMEI",
//         date: null,
//         latitude: null,
//         longitude: null,
//         speed: null,
//         heading: null,
//         altitude: null,
//         internalBattery: null,
//         vehicleBattery: null,
//         gsmSignal: null,
//         gpsSatellites: null,
//         vehicleContact: null,
//         accelerometer: null,
//         energySavings: null,
//         externalFeed: null,
//         gpsState: null,
//         alarmArmed: null,
//         engineCut: null,
//         siren: null,
//         ain2: null,
//         din1: null,
//         din2: null,
//         din3: null,
//         din4: null
//     });
//     t.end();
//   });
//   t.context.socket.write("PA$IMEI#DDMMAA#dsad#Latitud#S#Longitud#E#asds#asdsa#asdasd#dasd#sds#xx#XXXX");
// });

// // test.cb("triggers error and displays original payload when failed to parse a message", t => {
// //     t.context.tracker.on("error", (error, buffer) => {
// //         t.is(buffer.toString(), "21321sdsad/(&%&%/)0x8766");
// //         t.end();
// //     });
// //     t.context.socket.write("21321sdsad/(&%&%/)0x8766");
// // });

// test.cb("handles status reports with no data", t => {
//   t.context.tracker.on("report", data => {
//     t.deepEqual(data.data, {
//         imei: null,
//         date: null,
//         latitude: null,
//         longitude: null,
//         speed: null,
//         heading: null,
//         altitude: null,
//         internalBattery: null,
//         vehicleBattery: null,
//         gsmSignal: null,
//         gpsSatellites: null,
//         vehicleContact: null,
//         accelerometer: null,
//         energySavings: null,
//         externalFeed: null,
//         gpsState: null,
//         alarmArmed: null,
//         engineCut: null,
//         siren: null,
//         ain2: null,
//         din1: null,
//         din2: null,
//         din3: null,
//         din4: null
//     });
//     t.end();
//   });
//   t.context.socket.write("PA$");
// });

// test.cb("handles status reports with empty data", t => {
//     t.context.tracker.on("report", data => {
//         t.deepEqual(data.data, {
//             imei: "353990030327618",
//             date: null,
//             latitude: null,
//             longitude: null,
//             speed: null,
//             heading: null,
//             altitude: null,
//             internalBattery: null,
//             vehicleBattery: null,
//             gsmSignal: null,
//             gpsSatellites: 8,
//             vehicleContact: null,
//             accelerometer: null,
//             energySavings: null,
//             externalFeed: null,
//             gpsState: null,
//             alarmArmed: null,
//             engineCut: null,
//             siren: null,
//             ain2: null,
//             din1: null,
//             din2: null,
//             din3: null,
//             din4: null
//         });
//         t.end();
//     });
//     t.context.socket.write("PA$353990030327618#############8#");
// });

// test.cb("arms alarm", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `CO$${t.context.pin1}#S1\r`);
//           t.context.socket.write(`CO$${t.context.imei1}#S1`);
//         });
//         t.context.tracker.setFlag("alarm armed", true, (err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// test.cb("disarms alarm", t => {
//   t.context.heartbeat(() => {
//       t.context.socket.on("data", data => {
//           t.is(data.toString(), `CO$${t.context.pin1}#S0\r`);
//         t.context.socket.write(`CO$${t.context.imei1}#S0`);
//       });
//       t.context.tracker.setFlag("alarm armed", false, (err) => {
//           t.is(err, null);
//           t.end();
//       });
//   });
// });

// // test.cb("alarm arm throws error if response was incorrect", t => {
// //   let answer = `CO$${t.context.imei1}#asdsad`;
// //   t.context.heartbeat(() => {
// //       t.context.socket.on("data", data => {
// //           t.is(data.toString(), `CO$${t.context.pin1}#S0\r`);
// //           t.context.socket.write(answer);
// //       });
// //       t.context.tracker.setFlag("alarm armed", false, (err) => {
// //           t.truthy(err);
// //           t.true(err.message.indexOf(answer) > -1);
// //           t.end();
// //       });
// //   });
// // });

// // -- ALARMS --
// // test.cb("recognizes full alarm message", t => {
// //   const message = "AA$353990030327618#133015#22.64611#S#113.82682#E#SG";
// //   t.context.tracker.on("alarm", (data) => {
// //       t.is(data.raw, message);
// //       t.is(data.type, "accelerometer");
// //       var d = new Date();
// //       d.setHours(13);
// //       d.setMinutes(30);
// //       d.setSeconds(15);
// //       t.deepEqual(data.data, {
// //         date: d, 
// //         latitude: -22.0107685,
// //         longitude: 113.01378033333333
// //       });
// //       t.end();
// //   });
// //   t.context.socket.write(message);
// // });

// test.cb("responds to full alarm message", t => {
//   t.context.socket.on("data", function(data){
//       t.is(data.toString(), "AA$1#SG\r");
//       t.end();
//   });
//   t.context.socket.write("AA$353990030327618#133015#22.64611#S#113.82682#E#SG");
// });

// test.cb("recognizes bare alarm message", t => {
//     const message = "AA$353990030327618######SG";
//     t.context.tracker.on("alarm", (data) => {
//         t.is(data.raw, message);
//         t.is(data.type, "accelerometer");
//         t.deepEqual(data.data, {
//             date: null,
//             latitude: null,
//             longitude: null
//         });
//         t.end();
//     });
//     t.context.socket.write(message);
// });

// test.cb("responds to bare alarm message", t => {
//     t.context.socket.on("data", function(data){
//         t.is(data.toString(), "AA$1#SG\r");
//         t.end();
//     });
//     t.context.socket.write("AA$353990030327618######SG");
// });

// // test.cb("recognizes incomplete alarm message", t => {
// //     const message = "AA$353990030327618#133015#####SG";
// //     t.context.tracker.on("alarm", (data) => {
// //         t.is(data.raw, message);
// //         t.is(data.type, "accelerometer");
// //         var d = new Date();
// //         d.setHours(13);
// //         d.setMinutes(30);
// //         d.setSeconds(15);
// //         t.deepEqual(data.data, {
// //             date: d,
// //             latitude: null,
// //             longitude: null
// //         });
// //         t.end();
// //     });
// //     t.context.socket.write(message);
// // });
// // -- END ALARMS --

// test.cb("sets up the accelerometer sensibility", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `CO$${t.context.pin1}#AC13\r`);
//             t.context.socket.write(`CO$${t.context.imei1}#AC13`);
//         });
//         t.context.tracker.setAccelerometerSensibility(13, (err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// test.cb("throws an error if the device responds incorrectly to acc sensibility set", t => {
//     let answer = `CO$${t.context.imei1}#XCXZCX`;
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `CO$${t.context.pin1}#AC13\r`);
//             t.context.socket.write(answer);
//         });
//         t.context.tracker.setAccelerometerSensibility(13, (err) => {
//             t.truthy(err);
//             t.true(err.message.indexOf(answer) > -1);
//             t.end();
//         });
//     });
// });

// test.cb("sends request for report", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `CO$${t.context.pin1}#LB\r`);
//             t.context.socket.write(examples.reports.complete);
//         });
//         t.context.tracker.on("report", () => {
//             t.end();
//         });
//         t.context.tracker.requestReport((err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// // -- FIRMWARE --
// const firmwareRecordAddress = "08000258";
// const firmwareRecordData = "214601360121470136007EFE09D21901";
// const firmwateRecordChecksum = "61";

// test.cb("deletes firmware", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `OD$${t.context.pin1}\r`);
//             t.context.socket.write(`OD$${t.context.imei1}#1`);
//         });
//         t.context.tracker.deleteFirmware((err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// test.cb("updates firmware", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `OU$${t.context.pin1}\r`);
//             t.context.socket.write(`OU$${t.context.imei1}`);
//         });
//         t.context.tracker.updateFirmware((err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// test.cb("reads firmare record", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `OR$${t.context.pin1}#${firmwareRecordAddress}\r`);
//             t.context.socket.write(`OR$${t.context.imei1}#${firmwareRecordAddress}#${firmwareRecordData}`);
//         });
//         t.context.tracker.readFirmwareRecord(firmwareRecordAddress, (err, data) => {
//             t.is(err, null);
//             t.is(data, firmwareRecordData);
//             t.end();
//         });
//     });
// });

// test.cb("writes firmare record", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `OW$${t.context.pin1}#${firmwareRecordAddress}#${firmwareRecordData}#${firmwateRecordChecksum}\r`);
//             t.context.socket.write(`OW$${t.context.imei1}#${firmwareRecordAddress}#1`);
//         });
//         t.context.tracker.writeFirmwareRecord(firmwareRecordAddress, firmwareRecordData, firmwateRecordChecksum, (err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });

// test.cb("send linear address", t => {
//     t.context.heartbeat(() => {
//         t.context.socket.on("data", data => {
//             t.is(data.toString(), `OS$${t.context.pin1}#${firmwareRecordAddress}\r`);
//             t.context.socket.write(`OS$${t.context.imei1}`);
//         });
//         t.context.tracker.sendFirmwareStartLinearAddress(firmwareRecordAddress, (err) => {
//             t.is(err, null);
//             t.end();
//         });
//     });
// });
// -- END FIRMWARE --

test.cb("requestFirmwareVersion", t => {
    t.context.heartbeat(() => {
        t.context.socket.on("data", data => {
            t.is(data.toString(), `CO$${t.context.pin1}#F\r`);
            t.context.socket.write(`CO$${t.context.imei1}#123456`);
        });
        t.context.tracker.requestFirmwareVersion((err, version) => {
            t.is(err, null);
            t.is(version, "123456");
            t.end();
        });
    });
})