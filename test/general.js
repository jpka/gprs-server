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

    t.context.login = () => t.context.socket.write("PA$353990030327618$20$AP");
    t.context.heartbeat = () => t.context.socket.write("PA$353990030327618$22$AP");
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

test.cb("should recognize device login", t => {
    t.context.tracker.on("login", function() {
        t.pass();
        t.end();
    });
    t.context.login();
});

test.cb("should respond to device login", t => {
    t.context.socket.on("data", data => {
        t.is(data.toString(), "PA$353990030327618$20$AP");
        t.end();
    }); 
    t.context.login();
});

test.cb("should recognize heartbeat", t => {
    t.context.tracker.on("heartbeat", () => {
        t.pass();
        t.end();
    });
    t.context.heartbeat();
});

test.cb("should respond to heartbeat", t => {
    t.context.socket.on("data", function(data){
        t.is(data.toString(), "PA$353990030327618$22$AP");
        t.end();
    });
    t.context.heartbeat();
});

test.cb("handles status reports", t => {
    t.context.tracker.on("report", data => {
        t.deepEqual(data.data, {
            imei: "353990030327618",
            date: new Date("2009-11-17T02:09:28.000Z"),
            latitude: 22.537222,
            longitude: 114.020948
        });
        t.end();
    });
    t.context.socket.write("PA$353990030327618$D#091117#020928#1#22.537222#114.020948#0.00#0.0#42.1#4183#011#1#101#Wsz-wl001#B0101940#C+3.0,-5.0,+2.0$AP");
});

test.cb("triggers error and displays original payload when failed to parse a message", t => {
    t.context.tracker.on("error", (error, buffer) => {
        t.is(buffer.toString(), "21321sdsad/(&%&%$/$)0x8766");
        t.end();
    });
    t.context.socket.write("21321sdsad/(&%&%$/$)0x8766");
});

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