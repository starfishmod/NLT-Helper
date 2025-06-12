const vorpal = require('vorpal')();
const {SerialPort} = require('serialport');
const fs = require('fs');
//const ntlSocket = require('./nltSocket.js');
const say = require('say');
const {io}  = require("socket.io-client");
const { Table } = require("console-table-printer");
const wav = require('wav');
const Speaker = require('speaker');
const {platform} = require("node:os");


let racers = {};
let times = [];
let lastLap = false;
let speaking = false;
let sPort = null;
const configFileLocation = './config.json';

//***
class ntlSocket {
    constructor(  ) {
        this.socket = null;
        this.hostSupportedEvents = [];
        this.clientSupportedEvents = ['race','flag','gate','log'];
        this.attemptConnection();

    }

    attemptConnection() {
        if (this.socket && this.socket.connected) {
            return;
        }
        if (!global.config.ip || !global.config.api) {
            return;
        }
        console.log('Connecting to socket');
        this.socket = io(`ws://${global.config.ip}:3001/neon-timing?token=${global.config.api}`, {
            transports: ['websocket'],
            upgrade: false,
            reconnectionDelayMax: 2000
        });
        this.socket.on("connect", () => {
            const engine = this.socket.io.engine;
            this.hostSupportedEvents = [];
            console.log('Connection opened');
            global.sendSerialMessage("NLT Connected");

            engine.on("close", (reason) => {
                this.hostSupportedEvents = [];
                console.log('Connection closed');
                global.sendSerialMessage("NLT Disconnect");
            });
        });
        this.socket.on('host_event', message => {
            if(global.config.debug)console.log('received event from host', message);

            switch(message.cmd) {
                case 'handshake_init':
                    if (message.protocol !== 'NT1') {
                        if(global.config.debug)console.log('Protocol is not valid.')
                        this.socket.disconnect();
                    }
                    this.hostSupportedEvents = message.events;
                    this.sendClientEvent({
                        cmd: 'handshake_ack',
                        events: this.clientSupportedEvents,
                        device: 'NLT Socket Bridge',
                        init_time: message.time
                    });
                    break;
                case 'event':
                    switch (message.evt) {
                        case 'race':
                            switch (message.type) {
                                case 'race_staging':
                                    //Line 'em Up!
                                    global.sendSerialMessage(" READY");
                                    countdown();
                                    break;
                                case 'countdown_started':
                                    global.sendSerialMessage("   SET");
                                    break;
                                case 'countdown_end_delay_started':
                                    break;
                                case 'race_started':
                                    //Go Go Go!
                                    global.sendSerialMessage(" GO! GO! GO! GO! GO!");
                                    racers = {};
                                    times=[]; lastLap=false;
                                    break;
                                case 'race_time_over':
                                    //Last Lap!
                                    global.sendSerialMessage("  Last Lap");
                                    lastLap=true;
                                    break;
                                case 'race_completed':
                                    //Race Ended
                                    global.sendSerialMessage(" Race Ended");
                                    let winnerList = Object.values(racers);
                                    winnerList.sort((a,b)=> {
                                        if(a.laps !== b.laps){
                                            return b.laps - a.laps;
                                        }else{
                                            return a.elapsed - b.elapsed;
                                        }
                                    });

                                    if(winnerList.length){
                                        setTimeout(()=>{
                                            global.sendSerialMessage("1st "+winnerList[0].name);
                                        },8000);
                                    }

                                    if(global.config.nextClass){
                                        global.config.classes[global.config.nextClass].results.push(
                                            ...winnerList
                                        );
                                        delete global.config.nextClass;
                                        global.writeConfig();
                                    }
                                    break;
                                case 'racer_passed_gate':
                                    /*{
									  cmd: 'event',
									  evt: 'race',
									  type: 'racer_passed_gate',
									  fast: false,
									  streak: false,
									  valid: false,
									  transponder: 'demo-2',
									  gate: '1',
									  gate_type: 'finish',
									  protocol: 'NT1',
									  time: 1744333961827,
									  did: 'NLT-PC-1046'
									}
                                    */

                                    if(racers[message.transponder]){
                                        racers[message.transponder].streak = message.streak;
                                    }
                                    break;
                                case 'standing':
                                    /*{
                                      cmd: 'event',
                                      evt: 'race',
                                      type: 'standing',
                                      name: 'demo-1',
                                      laps: 0,
                                      fast_lap: 0,
                                      elapsed: 0,
                                      id: 'EGld1jbRLW1fQpi7',
                                      transponder: 'demo-1',
                                      status: 'dnf',
                                      protocol: 'NT1',
                                      time: 1744333962247,
                                      did: 'NLT-PC-1046'
                                    }
                                    */

                                    if(!racers[message.transponder]){
                                        racers[message.transponder] = message;
                                        if(global.config.heat){
                                            racers[message.transponder].heat = global.config.heat;
                                        }
                                    }else if(message.status === 'active'){
                                        racers[message.transponder].laptime = message.elapsed - racers[message.transponder].elapsed;
                                        racers[message.transponder].elapsed = message.elapsed;
                                        racers[message.transponder].laps = message.laps;
                                        racers[message.transponder].fast_lap = message.fast_lap;

                                        let time = Number(racers[message.transponder].laptime/1000).toFixed(2);
                                        times.unshift(time);
                                        times = times.slice(0,3)
                                        if(!lastLap){
                                            global.sendSerialMessage(times.join(' '), false);
                                        }
                                        if(global.config.nextClass){
                                            if(global.config.classes[global.config.nextClass].fastest.laptime > racers[message.transponder].laptime){

                                                if(global.config.classes[global.config.nextClass].fastest.laptime !== 9999999999999){
                                                    speakUp(`${racers[message.transponder].name} has fastest lap of ${Number(racers[message.transponder].laptime/1000).toFixed(2)} seconds for ${global.config.nextClass} class!`);
                                                }

                                                global.config.classes[global.config.nextClass].fastest = {
                                                    laptime: racers[message.transponder].laptime,
                                                    name: racers[message.transponder].name
                                                }
                                            }
                                            global.writeConfig();
                                        }
                                    }else if(message.status === 'complete'){
                                        racers[message.transponder].laptime = message.elapsed - racers[message.transponder].elapsed;
                                        racers[message.transponder].elapsed = message.elapsed;
                                        racers[message.transponder].laps = message.laps;
                                    }
                                    break;
                            }
                            break;
                    }
                    break;
            }

            if (message.cmd === 'handshake_init') {

            }
        });
    }



    newGateEvent(transponder) {
        this.sendClientEvent({
            cmd: 'event',
            evt: 'gate',
            type: 'transponder_passed_gate',
            transponder
        });
    }

    sendClientEvent(event) {
        if (!this.socket || !this.socket.connected) {
            if(global.config.debug)console.log('socket is not connected, cannot send message');
            return;
        }
        if (event.evt && !this.hostSupportedEvents.includes(event.evt)) {
            if(global.config.debug)console.log('Host does not support ' + event.evt + ' events');
            return;
        }
        const data = {
            ...event,
            time: Date.now(),
            protocol: 'NT1',
            did: global.config.did
        };
        if(global.config.debug)console.log('sending client event', data);
        this.socket.emit('client_event', data);
    }
}

//***

speakUp(`NLT Helper`);

global.config = fs.existsSync(configFileLocation)?JSON.parse(fs.readFileSync(configFileLocation)):{did : Math.random().toString(36).slice(2),classes:{}} ;

global.writeConfig = function(){
    fs.writeFileSync(configFileLocation, JSON.stringify(global.config,2,2), {flag: 'w+'});
}



global.sendSerialMessage = function(msg, showConsole = true){
    if(sPort)sPort.write(msg+"\n");
	if(showConsole)console.log(msg);
}

SerialConnect();

let ntl = new ntlSocket();

vorpal
    .delimiter('NLT Bridge>')
    .show();

vorpal
    .command("port [port]", "sets the serial port")
    .autocomplete({data: function(input, cb) {
        let portL =[];
            SerialPort.list().then(ports => {
                ports.forEach(function (port) {
                    if(port.path.match(/ttyS[0-9+]/))return;
                    portL.push(port.path);
                })
                cb(portL);
            });
        }})
    .action(function(args, cb){
        global.config.port = args.port;
        writeConfig();
        SerialConnect();
        cb();
    });

vorpal
    .command("apikey [api]", "sets the apikey")
    .action(function(args, cb){
        global.config.api = args.api;
        writeConfig();
        ntl.attemptConnection();
        cb();
    });

vorpal
    .command("ip [ip]", "sets the ip")
    .action(function(args, cb){
        global.config.ip = args.ip;
        writeConfig();
        ntl.attemptConnection();
        cb();
    });

vorpal
    .command("reconnect", "reconnect")
    .action(function(args, cb){
        ntl.attemptConnection();
        cb();
    });

vorpal
    .command("debug", "Debug toggle")
    .action(function(args, cb){
        global.config.debug = !global.config.debug;
        console.log(`Debug is ${global.config.debug?'On':'Off'}`);
        writeConfig();
        cb();
    });

vorpal
    .command("clearclasses", "Clear Class details")
    .action(function(args, cb){
        global.config.classes={};
        writeConfig();
        cb();
    });

vorpal
    .command("addclass [class]", "Add a Class")
    .action(function(args, cb){
        global.config.classes[args.class] = {fastest:{laptime:9999999999999}, results:[]};
        writeConfig();
        cb();
    });

vorpal
    .command("dropHeats [dropHeat]", "Heats to drop during Calc")
    .action(function(args, cb){
        global.config.dropHeat = parseInt(args.dropHeat,10);
        cb();
    });

vorpal
    .command("nextrace [class] [heat]", "Set next Class to race ")
    .autocomplete({data: function(input, cb) {
        cb(Object.keys(global.config.classes));
    }})
    .action(function(args, cb){
        if(!global.config.classes[args.class]){
            console.log(`No Class: ${global.config.nextClass}`);
        }else if(!args.heat){
            console.log(`No Heat Set`);
        }else{
            global.config.nextClass = args.class;
            global.config.heat = parseInt(args.heat,10);
            //sendSerialMessage(`Line Up: ${global.config.nextClass}`);
            speakUp(`${global.config.nextClass} class to line up for Heat ${global.config.heat}`);

        }
        cb();
    });


vorpal
    .command("results [class]", "Detail overall position results for a class")
    .autocomplete({data: function(input, cb) {
            cb(Object.keys(global.config.classes));
        }})
    .action(function(args, cb){
        if(!global.config.classes[args.class]){
            cb();
            return;
        }

        const pointsAmounts = [10,8,7,6,5,4,3,2,1]; //Todo Make this configurable??

        let winnerList = global.config.classes[args.class].results;

        let racers = {};
        let heats = {};
        winnerList.map(winner => {
            if(!racers[winner.name]){
                racers[winner.name] = {name: winner.name, heat:{},points:0};
            }
            racers[winner.name].heat[winner.heat || 0] = {laps:winner.laps, elapsed:winner.elapsed};

            if(!heats[winner.heat || 0]){
                heats[winner.heat || 0] = [];
            }
            heats[winner.heat || 0].push(winner);
        });

        Object.keys(heats).map(heat => {
            heats[heat].sort(compareTimes);

            heats[heat].map((racer,idx)=>{
                //heats[heat][idx].points = pointsAmounts[idx] || 0;
                racers[heats[heat][idx].name].points += pointsAmounts[idx]  || 0;
                racers[heats[heat][idx].name].heat[heat].points = pointsAmounts[idx]  || 0;
            });
        })

        racers= Object.values(racers);

        //Recalc points on drop lowest points heats
        racers.map(racer => {
            let points = Object.values(racer.heat).map(a => a.points)
                .toSorted((a, b) => b - a)
                .slice(0,(global.config.heat - global.config.dropHeat)||1);
            racer.points = points.reduce((partialSum, a) => partialSum + a, 0);
        });

        racers.sort((a,b)=> {
            let a_rheats = Object.values(a.heat);
            a_rheats.sort(compareTimes);
            let a_Best = a_rheats[0];

            let b_rheats = Object.values(b.heat);
            b_rheats.sort(compareTimes);
            let b_Best = b_rheats[0];
            if(a.points !== b.points){
                return b.points - a.points;
            }else if(a_Best.laps !== b_Best.laps){
                return b_Best.laps - a_Best.laps;
            }else{
                return a_Best.elapsed - b_Best.elapsed;
            }

        });

        let cols = [
            {
                name: "position",
                alignment: "center",
                title: "POS"
            },
            {
                name: "name",
                alignment: "left",
                title: "Name",
            },
            {
                name: "points",
                alignment: "center",
                title: "Points",
            }
        ];

        for(let heat in heats){
            cols.push({
                name: heat,
                alignment: 'right',
                title: `Heat ${heat}`,
            });
        }

        const p = new Table({
            columns: cols
        });

        racers.map((racer,idx) => {
            let out = { position: idx+1, name:racer.name, points: racer.points };
            for(let heat in heats){
                let f =racer.heat[heat];
                //out[heat] = f ? `${f.laps}/${Number(f.elapsed/1000).toFixed(3)}`:'--';
                out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}`:'--';
            }

            p.addRow(out);
        })


        p.printTable();
        console.log(`Fastest Lap: ${global.config.classes[args.class].fastest.name} ${global.config.classes[args.class].fastest.laptime/1000} secs`);
        cb();
    });

//**




function filterArrayObject(arr, key) {
    const seenValues = new Set();
    return arr.filter(obj => {
        const value = obj[key];
        if (seenValues.has(value)) {
            return false;
        }
        seenValues.add(value);
        return true;
    });
}

function compareTimes(a,b) {
    if(a.laps !== b.laps){
        return b.laps - a.laps;
    }else{
        return a.elapsed - b.elapsed;
    }
}


const convertMilliSecondToReadable = (milliSecond) => {
    const hours = Math.floor(milliSecond / (1000 * 60 * 60));
    let remainingMilliSecond = milliSecond - (hours * 1000 * 60 * 60);
    const minutes = Math.floor(remainingMilliSecond / (1000 * 60));
    remainingMilliSecond = remainingMilliSecond - (minutes * 1000 * 60);
    const seconds = Math.floor(remainingMilliSecond / 1000);
    remainingMilliSecond = remainingMilliSecond - (seconds * 1000);

    return `${hours?Number(hours).toString(10).padStart(2, '0')+':':''}${Number(minutes).toString(10).padStart(2, '0')}:${Number(seconds).toString(10).padStart(2, '0')}.${Number(remainingMilliSecond).toString(10).padStart(3, '0')}`;

};


function speakUp(txt){
    if(platform()==='linux'){ //There is many bugs in Say for Linux :/
        console.log(txt);
        say.speak(txt, null, null,()=>{speaking=false;});
        return
    }
    if(speaking){
        say.stop(()=>{
            speaking = false;
            setImmediate(()=>{speakUp(txt);});
        });
    }else{
        speaking = true;
        console.log(txt);
        say.speak(txt, null, null,()=>{speaking=false;});
    }
}

function countdown(){
    const file = fs.createReadStream('./countdown.wav');
    const reader = new wav.Reader();

    reader.on('format', (format) => {
        reader.pipe(new Speaker(format));
    });
    file.pipe(reader);
}

function SerialConnect(){
    if(!global.config.port){ return}

    SerialPort.list().then(ports => {
        ports.forEach(function (port) {
            if(port.path!==global.config.port)return;
            sPort = new SerialPort({
                path: global.config.port,
                baudRate: 115200,
            });
            sPort.open(function (err) {
                if (err) {
                    return console.log('Error opening port: ', err.message)
                }
            });

            // The open event is always emitted
            sPort.on('open', function() {
                sendSerialMessage("  Connected");
            });
        });
    });
}