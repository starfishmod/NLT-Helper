const vorpal = require('vorpal')();
const {SerialPort} = require('serialport');
const fs = require('fs');
const say = require('say');
const {io}  = require("socket.io-client");
const { Table } = require("console-table-printer");
const wav = require('wav');
const Speaker = require('speaker');
const {platform} = require("node:os");
const { globSync} = require("glob");

const writeXlsxFile = require('write-excel-file/node')

const prompts = require('prompts');
//prompts.override(require('yargs').argv);

const configVersion = 3;
let racers = {};
let times = [];
let lastLap = false;
let speaking = false;
let sPort = null;
let socket = null;
let hostSupportedEvents = [];
const configFileLocation = './config.json';
let config, raceEvent;// = fs.existsSync(configFileLocation)?JSON.parse(fs.readFileSync(configFileLocation)):{did : Math.random().toString(36).slice(2),classes:{}} ;


//***

loadConfig();

speakUp(`NLT Helper`);
SerialConnect();
attemptSocketConnection();

loadRaceEventFile();

//***
vorpal
    .delimiter('NLT Bridge>')
    .show();

vorpal
    .command("port <port>", "sets the serial port")
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
        config.port = args.port;
        writeConfig();
        SerialConnect();
        cb();
    });

vorpal
    .command("apikey <api>", "sets the apikey")
    .action(function(args, cb){
        config.api = args.api;
        writeConfig();
        attemptSocketConnection();
        cb();
    });

vorpal
    .command("ip <ip>", "sets the ip")
    .action(function(args, cb){
        config.ip = args.ip;
        writeConfig();
        attemptSocketConnection();
        cb();
    });

vorpal
    .command("reconnect", "reconnect")
    .action(function(args, cb){
        attemptSocketConnection();
        cb();
    });

vorpal
    .command("debug", "Debug toggle")
    .action(function(args, cb){
        config.debug = !config.debug;
        this.log(`Debug is ${config.debug?'On':'Off'}`);
        writeConfig();
        cb();
    });

vorpal
    .command("audio", "Audio features")
    .action(function(args, cb){
        let jsfiles = globSync('./event_*') || [];
        let choices = [{
            title:'Countdown Announcement', value:'countdown'
        },{
            title:'Fastest in Class Announce', value:'fastestClass'
        },{
            title:'Line Up Announcement', value:'lineup'
        }];
        choices.map((choice) => {
            if(!config.mute[choice.value]){
                choice.selected = true;
            }
        })

        prompts([
            {
                type: 'multiselect',
                name: 'audio',
                message: 'Select Audio Option:',
                choices: choices
            }
        ]).then((response) => {
            const audioTypes = ['countdown','fastestClass','lineup'];
            config.mute={};
            audioTypes.map((type) => {
                config.mute[type] = !!(response.audio.indexOf(type)===-1)
            });
            writeConfig();
            cb();
        }).catch((err) => {
            cb();
        });
    });

vorpal
    .command("newevent <eventname...>", "Start a new event")
    .action(function(args, cb){
          config.raceEventFile = './event_'+args.eventname.join('_').replace(/[^A-Za-z0-9_]]/g,'-');
        raceEvent = {
            name: args.eventname.join(' '),
            classes: {}
        };

        Object.keys(config.defaultClasses).map((className) => {
            raceEvent.classes[className] = cleanClass();
        });
        raceEvent.raceday=[];
        writeConfig();
        writeRaceEvent();
        cb();
    });

vorpal
    .command("loadevent", "Load a previous event")
    .action(function(args, cb){
        let jsfiles = globSync('./event_*') || [];
        let choices = [];
        jsfiles.map((file) => {
            try {
                let event = JSON.parse(fs.readFileSync(file));
                choices.push({title:event.name, value:file});
            }catch (e) {}
        })

        prompts([
            {
                type: 'select',
                name: 'eventFile',
                message: 'Select Event:',
                choices: choices
            }
        ]).then((response) => {
            //console.log(response);
            config.raceEventFile = './'+response.eventFile;
            writeConfig();
            loadRaceEventFile();
            cb();
        }).catch((err) => {
            cb();
        });
    });


vorpal
    .command("clearclasses", "Clear Class details for the current Event (deprecated)")
    .action(function(args, cb){
        Object.keys(config.defaultClasses).map((className) => {
            raceEvent.classes[className] = cleanClass();
        });
        raceEvent.raceday=[];
        writeRaceEvent();
        cb();
    });

vorpal
    .command("removeclass <class>", "Remove a Default Class")
    .types({
        string: ['class']
    })
    .autocomplete({data: function(input, cb) {
            cb(cObject.keys(config.defaultClasses));
        }})
    .action(function(args, cb){
        delete config.defaultClasses[args.class];
        writeConfig();
        cb();
    });

vorpal
    .command("addclass <class>", "Add a Default Class (also adds it to the current Event)")
    .types({
        string: ['class']
    })
    .action(function(args, cb){
        if(config.defaultClasses[args.class] === undefined){
            config.defaultClasses[args.class]={};
        }
        if(raceEvent?.classes && !raceEvent.classes[args.class]){
            raceEvent.classes[args.class] = cleanClass();
        }
        writeRaceEvent();
        writeConfig();
        cb();
    });

vorpal
    .command("dropheats <dropHeat>", "Heats to drop during Calc")
    .action(function(args, cb){
        config.dropHeat = parseInt(args.dropHeat,10);
        writeConfig();
        cb();
    });

vorpal
    .command("points <points...>", "Points for each position from 1st onwards")
    .action(function(args, cb){
        config.points = args.points;
        writeConfig();
        cb();
    });

vorpal
    .command("splitfinals <finalsplit> [class]", "Split each finals into groups.")
    .types({
        //integer: ['finalsplit'],
        string: ['class']
    })
    .autocomplete({data: function(input, cb,arg) {
            if(arg === 'class') {
                cb(Object.keys(config.defaultClasses));
            }else if(arg === 'finalsplit') {
                cb(["1","2","3","4","5","6"]);
            }
            else{
                cb();
            }
        }})
    .action(function(args, cb){
        if(args.class){
            if(!raceEvent.classes[args.class]){
                this.log("No Class with that name")
                cb();
                return;
            }
            raceEvent.classes[args.class].split = args.finalsplit;
            writeRaceEvent();
        }else {
            config.finalGroupSplit = args.finalsplit;
            writeConfig();
        }

        cb();
    });

vorpal
    .command("removeheat <class> <heat> [group]", "Remove Previously run Class/Heat and option Group to race ")
    .types({
        string: ['class','group']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb,arg) {
            if(!raceEvent?.classes){
                cb();
                return;
            }
            if(arg === 'class') {
                cb(Object.keys(raceEvent.classes));
            }else if(arg === 'heat') {
                cb(["1","2","3","4","5","6"]);
            }else if(arg === 'group') {
                cb(["A","B","C","D","E","F"]);
            }else{
                cb([]);
            }
    }})
    .action(function(args, cb) {
        if(raceEvent.raceday
            .filter(race=>race.class===args.class
                && race.group===(args.group||"") && race.heat===args.heat).length) {
            this.prompt({
                type: 'confirm',
                name: 'confirmDelete',
                message: `Are you sure you want to delete ${args.class}?`,
                default: false
            }).then((result) => {
                if (result.confirmDelete) {
                    // Add actual deletion logic here
                    this.log(`Deleting ${args.class}...`);
                    raceEvent.raceday = config.raceday
                        .filter(race=>race.class!==args.class
                            || race.group!==(args.group||"") || race.heat!==args.heat);

                    raceEvent.classes[args.class].results = raceEvent.classes[args.class].results
                        .filter(race => (race.group||"")!==(args.group||"") || race.heat!==args.heat);
                    writeRaceEvent();
                } else {
                    this.log(`Deletion of ${args.class} cancelled.`);
                }
                cb();
            });
        }else{
            this.log(`Race does not exist.`);
            cb();
        }
    });

vorpal
    .command("nextheat <class> <heat> [group]", "Set next Class/Heat and optional Group to race ")
    .types({
        string: ['class','group']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb, arg) {
            if(arg === 'class') {
                cb(Object.keys(raceEvent.classes));
            }else if(arg === 'heat') {
                cb(["1","2","3","4","5","6"]);
            }else if(arg === 'group') {
                cb(["A","B","C","D","E","F"]);
            }else{
                cb([]);
            }
    }})
    .action(function(args, cb){
        if(!raceEvent?.classes){
            cb();
            return;
        }
        if(raceEvent.raceday
            .filter(race=>race.class===args.class
                && race.group===(args.group||"") && race.heat===args.heat).length){
            this.log('This race has already been run');
        }else if(!raceEvent.classes[args.class]){
            this.log(`No Class: ${arg.class}`);
        }else{
            //Display Line up
            let raceList = raceEvent.classes[args.class].results.filter(res=>res.heat===args.heat-1 && res.group===(args.group||""));
            raceList.sort(compareTimes);
            if(raceList.length > 0){
                const p = new Table({
                    columns: [
                        {name: "position",alignment: "center",title: "Line Up POS"},
                        {name: "name",alignment: "left",title: "Name"}
                    ]
                });
                raceList.map((racer,idx) => {
                    let out = { position: idx+1, name:racer.name};
                    p.addRow(out);
                })
                p.printTable();
            }

            raceEvent.nextClass = args.class;
            raceEvent.nextGroup = args.group || '';
            raceEvent.nextHeat = parseInt(args.heat,10);
            sendSerialMessage(`Line Up: ${raceEvent.nextClass}${ raceEvent.nextGroup ? ' '+ raceEvent.nextGroup:'' }`);
            if(!config.mute.lineup)speakUp(`${raceEvent.nextClass} class ${ raceEvent.nextGroup ? 'Group '+ raceEvent.nextGroup:'' } to line up for Heat ${raceEvent.nextHeat}`);

        }
        cb();
    });

vorpal
    .command("allresults", "Detail results for all classes")
    .action(function(args, cb){
        if(!raceEvent?.classes){
            cb();
            return;
        }
        Object.keys(raceEvent.classes).map(className=>{
            this.log(`${className} Results`);

            displayResults(className);
            this.log(`=============================================`);
        });

        cb();
    });

vorpal
    .command("results <class>", "Detail overall position results for a class")
    .types({
        string: ['class']
    })
    .autocomplete({data: function(input, cb) {
            cb(Object.keys(raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!raceEvent?.classes[args.class]){
            cb();
            return;
        }
        displayResults(args.class);
       cb();
    });

vorpal
    .command("export <class>", "Detail overall position results for a class")
    .types({
        string: ['class']
    })
    .autocomplete({data: function(input, cb) {
            cb(Object.keys(raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!raceEvent?.classes[args.class]){
            cb();
            return;
        }
        exportResults(args.class);
        cb();
    });

vorpal
    .command("final <class> <group>", "Run the Finals for Class/Heat and option Group")
    .types({
        string: ['class']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb, arg) {
            if(!raceEvent?.classes){
                cb();
                return;
            }
            if(arg === 'class') {
                cb(Object.keys(raceEvent.classes));
            }else if(arg === 'group') {
               // let spf = (raceEvent.classes[args.class]?.split || config.finalGroupSplit);
                cb(["A","B","C","D","E","F"]/*.slice(0,spf)*/);
            }else{
                cb([]);
            }
                }})
    .action(function(args, cb){
        if(!raceEvent.classes[args.class]){
            this.log(`No Class: ${arg.class}`);
        }else{
            //Display Line up
            let {racers, heats}  = sortHeatResults(raceEvent.classes[args.class].results);
            let finalSplit = Math.ceil(racers.length / (raceEvent.classes[args.class]?.split || config.finalGroupSplit));
            let sliceStart = (args.group.charCodeAt(0)-65)*finalSplit;
            let raceList = racers.slice(sliceStart, sliceStart+finalSplit);
            if(raceList.length > 0){
                const p = new Table({
                    columns: [{
                        name: "position",
                        alignment: "center",
                        title: "Line Up POS"
                    },
                        {
                            name: "name",
                            alignment: "left",
                            title: "Name",
                        }
                    ]
                });
                raceList.map((racer,idx) => {
                    let out = { position: idx+1, name:racer.name};
                    p.addRow(out);
                })
                p.printTable();
            }


            raceEvent.nextClass = args.class;
            raceEvent.nextGroup = args.group || '';
            raceEvent.nextFinal = 1;
            sendSerialMessage(`Final: ${raceEvent.nextClass}${ raceEvent.nextGroup ? ' '+ raceEvent.nextGroup:'' }`);
            if(!config.mute.lineup)speakUp(`${raceEvent.nextClass} class ${ raceEvent.nextGroup ? 'Group '+ raceEvent.nextGroup:'' } to line up for the Final`);

        }
        cb();
    });


vorpal
    .command("mergeuser <class>", "Merge user results for a class")
    .types({
        string: ['class']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb, arg) {
        cb(Object.keys(raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!raceEvent.classes[args.class]){
            this.log(`No Class: ${arg.class}`);
            cb();
            return;
        }


        let choices = {};
        raceEvent.classes[args.class].results.map((r) => {
            let id = `${r.transponder}:${r.name}`;
            if(!choices[id]){
                choices[id] = {title:id, value:id};
            }
        });

        raceEvent.classes[args.class].finals.map((r) => {
            let id = `${r.transponder}:${r.name}`;
            if(!choices[id]){
                choices[id] = {title:id, value:id};
            }
        });

        prompts([
            {
                type: 'select',
                name: 'id',
                message: 'Select User Merge:',
                choices: Object.values(choices)
            },
            {
                type: 'select',
                name: 'id2',
                message: 'Select User Merge into:',
                choices: Object.values(choices)
            }
        ]).then((response) => {
                let [newtransponder, newname] = response.id2.split(':');
                raceEvent.classes[args.class].results.map((r) => {
                    let id =`${r.transponder}:${r.name}`;
                    if(id === response.id){
                       r.name=newname;
                       r.transponder=newtransponder;
                    }
                });

                raceEvent.classes[args.class].finals.map((r) => {
                    let id = `${r.transponder}:${r.name}`;
                    if(id === response.id){
                        r.name=newname;
                        r.transponder=newtransponder;
                    }
                });
                writeRaceEvent();
                cb();

        }).catch((err) => {
            cb();
        });

    });

//**

function compareTimes(a,b) {
    if(a.laps !== b.laps){
        return b.laps - a.laps;
    }else{
        return a.elapsed - b.elapsed;
    }
}

function convertMilliSecondToReadable (milliSecond) {
    const hours = Math.floor(milliSecond / (1000 * 60 * 60));
    let remainingMilliSecond = milliSecond - (hours * 1000 * 60 * 60);
    const minutes = Math.floor(remainingMilliSecond / (1000 * 60));
    remainingMilliSecond = remainingMilliSecond - (minutes * 1000 * 60);
    const seconds = Math.floor(remainingMilliSecond / 1000);
    remainingMilliSecond = remainingMilliSecond - (seconds * 1000);

    return `${hours?Number(hours).toString(10).padStart(2, '0')+':':''}${Number(minutes).toString(10).padStart(2, '0')}:${Number(seconds).toString(10).padStart(2, '0')}.${Number(remainingMilliSecond).toString(10).padStart(3, '0')}`;
}


function speakUp(txt){
    if(platform()==='linux'){ //There is many bugs in Say for Linux :/
        console.log(txt+"\n");
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
        console.log(txt+"\n");
        say.speak(txt, null, null,()=>{speaking=false;});
    }
}

function countdown(){
    if(config.mute.countdown)return;
    const file = fs.createReadStream(__dirname+'/countdown.wav');
    const reader = new wav.Reader();

    reader.on('format', (format) => {
        reader.pipe(new Speaker(format));
    });
    file.pipe(reader);
}

function SerialConnect(){
    if(!config.port){ return}

    SerialPort.list().then(ports => {
        ports.forEach(function (port) {
            if(port.path!==config.port)return;
            sPort = new SerialPort({
                path: config.port,
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


function attemptSocketConnection() {
    if (socket && socket.connected) {
        return;
    }
    if (!config.ip || !config.api) {
        return;
    }
    console.log("Connecting to socket\n");
    socket = io(`ws://${config.ip}:3001/neon-timing?token=${config.api}`, {
        transports: ['websocket'],
        upgrade: false,
        reconnectionDelayMax: 2000
    });
    socket.on("connect", () => {
        const engine = socket.io.engine;
        hostSupportedEvents = [];
        console.log("Connection opened\n");
        sendSerialMessage("NLT Connected");

        engine.on("close", (reason) => {
            hostSupportedEvents = [];
            console.log(`Connection closed - ${reason}\n`);
            sendSerialMessage("NLT Disconnect");
        });
    });
    socket.on('host_event', message => {
        if(config.debug)console.log('received event from host', message);

        switch(message.cmd) {
            case 'handshake_init':
                if (message.protocol !== 'NT1') {
                    if(config.debug)console.log("Protocol is not valid.\n")
                    socket.disconnect();
                }
                hostSupportedEvents = message.events;
                sendSocketEvent({
                    cmd: 'handshake_ack',
                    events: ['race','flag','gate','log'],
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
                                sendSerialMessage(" READY");
                                countdown();
                                break;
                            case 'countdown_started':
                                sendSerialMessage("   SET");
                                break;
                            case 'countdown_end_delay_started':
                                break;
                            case 'race_started':
                                //Go Go Go!
                                sendSerialMessage(" GO! GO! GO! GO! GO!");
                                racers = {};
                                times=[]; lastLap=false;
                                break;
                            case 'race_time_over':
                                //Last Lap!
                                sendSerialMessage("  Last Lap");
                                lastLap=true;
                                break;
                            case 'race_completed':
                                //Race Ended
                                sendSerialMessage(" Race Ended");
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
                                        sendSerialMessage("1st "+winnerList[0].name);
                                    },8000);
                                }

                                if(raceEvent.nextClass){
                                    if(raceEvent.nextHeat){
                                        raceEvent.classes[raceEvent.nextClass].results.push(
                                            ...winnerList
                                        );

                                        raceEvent.raceday.push({
                                            class:raceEvent.nextClass,
                                            heat:raceEvent.nextHeat,
                                            group:raceEvent.nextGroup
                                        });
                                        delete raceEvent.nextHeat;
                                    }
                                    if(raceEvent.nextFinal){
                                        raceEvent.classes[raceEvent.nextClass].finals.push(
                                            ...winnerList
                                        );

                                        raceEvent.raceday.push({
                                            class:raceEvent.nextClass,
                                            final:raceEvent.nextFinal,
                                            group:raceEvent.nextGroup
                                        });
                                        delete raceEvent.nextFinal;
                                    }
                                    delete raceEvent.nextClass;

                                    delete raceEvent.nextGroup;
                                    writeRaceEvent();
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
                                    if(raceEvent.nextHeat){
                                        racers[message.transponder].heat = raceEvent.nextHeat;
                                        racers[message.transponder].group = raceEvent.nextGroup;
                                    }
                                    if(raceEvent.nextFinal){
                                        racers[message.transponder].final = raceEvent.nextFinal;
                                        racers[message.transponder].group = raceEvent.nextGroup;
                                    }
                                }

                                if(message.status === 'active'){
                                    racers[message.transponder].laptime = message.elapsed - racers[message.transponder].elapsed;
                                    racers[message.transponder].elapsed = message.elapsed;
                                    racers[message.transponder].laps = message.laps;
                                    racers[message.transponder].fast_lap = message.fast_lap;


                                }else if(message.status === 'complete'){
                                    racers[message.transponder].laptime = message.elapsed - racers[message.transponder].elapsed;
                                    racers[message.transponder].elapsed = message.elapsed;
                                    racers[message.transponder].laps = message.laps;
                                }


                                let time = Number(racers[message.transponder].laptime/1000).toFixed(2);
                                times.unshift(time);
                                times = times.slice(0,3)
                                if(!lastLap){
                                    sendSerialMessage(times.join(' '), false);
                                }

                                if(raceEvent.nextClass && racers[message.transponder].laptime){
                                    if(raceEvent.classes[raceEvent.nextClass].fastest[0].laptime > racers[message.transponder].laptime){

                                        if(raceEvent.classes[raceEvent.nextClass].fastest[0].laptime !== 9999999999999){
                                            if(!config.mute.fastestClass)speakUp(`${racers[message.transponder].name} has fastest lap of ${Number(racers[message.transponder].laptime/1000).toFixed(2)} seconds for ${raceEvent.nextClass} class!`);
                                        }

                                        raceEvent.classes[raceEvent.nextClass].fastest.unshift({
                                            laptime: racers[message.transponder].laptime,
                                            name: racers[message.transponder].name,
                                            detail: `${raceEvent.nextHeat?'Heat '+ raceEvent.nextHeat:'Final'} ${raceEvent.nextGroup?'Group '+raceEvent.nextGroup:''}`
                                        });
                                    }

                                    let id = `${message.transponder}:${message.name}`;
                                    if(raceEvent.nextHeat &&
                                        (
                                            !raceEvent.classes[raceEvent.nextClass].userFastestHeat[id]
                                        || raceEvent.classes[raceEvent.nextClass].userFastestHeat[id] > racers[message.transponder].laptime
                                        )
                                        ){
                                        raceEvent.classes[raceEvent.nextClass].userFastestHeat[id] =  racers[message.transponder].laptime;
                                    }
                                    if(raceEvent.nextFinal &&
                                        (
                                            !raceEvent.classes[raceEvent.nextClass].userFastestFinal[id]
                                            || raceEvent.classes[raceEvent.nextClass].userFastestFinal[id] > racers[message.transponder].laptime
                                        )
                                    ){
                                        raceEvent.classes[raceEvent.nextClass].userFastestFinal[id] =  racers[message.transponder].laptime;
                                    }
                                    //writeRaceEvent();
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

function sendSocketEvent(event) {
    if (!socket || !socket.connected) {
        if(config.debug)console.log('socket is not connected, cannot send message');
        return;
    }
    if (event.evt && !hostSupportedEvents.includes(event.evt)) {
        if(config.debug)console.log('Host does not support ' + event.evt + ' events');
        return;
    }
    const data = {
        ...event,
        time: Date.now(),
        protocol: 'NT1',
        did: config.did
    };
    if(config.debug)console.log('sending client event', data);
    socket.emit('client_event', data);
}

function loadConfig(){
    let fConf = fs.existsSync(configFileLocation)?JSON.parse(fs.readFileSync(configFileLocation)):{};
    let prevVer = fConf.version || 0;
    config = {
        did : Math.random().toString(36).slice(2),
        classes:{},
        ip:'127.0.0.1',
        debug: false,
        raceday:[],
        mute:{},
        //finalsplit:8,
        finalGroupSplit:1,
        points:[10,8,7,6,5,4,3,2,1],
        ...fConf
    };

    if(prevVer === 0){
        //Cleanup Classes
        for(let i in config.classes){
            if(!config.classes[i].finals)
                config.classes[i].finals = [];
        }

        //let's move to version 1
        config.defaultClasses = Object.keys(config.classes);
        config.raceEventFile = "";
        prevVer = 1;
    }

    if(prevVer === 1){
        //Cleanup Classes
        let dClass = {};
        config.defaultClasses.map(classN=>{dClass[classN]={};});
        config.defaultClasses = dClass;
    }

    config.version = configVersion;
}

function loadRaceEventFile(){
    if(!config.raceEventFile){
        console.log("No Race Event file found, cannot load RaceEventFile. Please use \"newevent\" command");
        return;
    }
    let raceeventFile = fs.existsSync(config.raceEventFile)?fs.readFileSync(config.raceEventFile):null;
    if(!raceeventFile){
        console.log("Race Event File not Found. Please use \"newevent\" or \"loadevent\" command");
        return
    }

    raceEvent = JSON.parse(raceeventFile);



    console.log(`Loading Race Event file: ${raceEvent.name}`);
}

function writeConfig(){
    fs.writeFileSync(configFileLocation, JSON.stringify(config,2,2), {flag: 'w+'});
}

function writeRaceEvent(){
    fs.writeFileSync(config.raceEventFile, JSON.stringify(raceEvent,2,2), {flag: 'w+'});
}

function sendSerialMessage(msg, showConsole = true){
    if(sPort)sPort.write(msg+"\n");
    if(showConsole)console.log(msg);
}

function sortHeatResults(winnerList){
    let racers = {};
    let heats = {};
    winnerList.map(winner => {
        let id = `${winner.transponder}:${winner.name}`;
        if(!racers[id]){
            racers[id] = {name: winner.name, id: id, heat:{},points:0};
        }
        racers[id].heat[winner.heat || 0] = {laps:winner.laps, elapsed:winner.elapsed};

        if(!heats[winner.heat || 0]){
            heats[winner.heat || 0] = [];
        }
        heats[winner.heat || 0].push(winner);
    });

    Object.keys(heats).map(heat => {
        heats[heat].sort(compareTimes);

        heats[heat].map((racer,idx)=>{
            //heats[heat][idx].points = pointsAmounts[idx] || 0;
            let id = `${heats[heat][idx].transponder}:${heats[heat][idx].name}` ;
            racers[id].points += config.points[idx]  || 0;
            racers[id].heat[heat].points = config.points[idx]  || 0;
        });
    })

    racers= Object.values(racers);

    //Recalc points on drop lowest points heats
    racers.map(racer => {
        let points = Object.values(racer.heat).map(a => a.points);
        points.sort((a, b) => b - a);
        points = points.slice(0,(Object.values(heats).length - (config.dropHeat || 0))||1);
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
    return {racers,heats};
}

function displayResults(className){
    let {racers, heats}  = sortHeatResults(raceEvent.classes[className].results);
    if(!racers.length){
        console.log("No results found.");
        return;
    }

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

    cols.push({
        name: 'fhlt',
        alignment: 'right',
        title: `Fastest Heat Lap Time`,
    });


    const p = new Table({
        columns: cols
    });

    let pos = 1;
    let fgroup = 1
    let finalSplit = Math.ceil(racers.length / (raceEvent.classes[className]?.split || config.finalGroupSplit));
    racers.map((racer,idx) => {
        let newGroup = (idx && !((idx+1) % finalSplit));
        //let id = `${racer.transponder}:${racer.name}`;
        let out = {
            position: `${String.fromCharCode(fgroup+64)} ${pos++}`,
            name:racer.name,
            points: racer.points,
            fhlt: convertMilliSecondToReadable(raceEvent.classes[className].userFastestHeat?.[racer.id]) || '--'
        };
        for(let heat in heats){
            let f =racer.heat[heat];
            out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}`:'--';
        }
        p.addRow(out,{separator: newGroup});
        if(newGroup){
            pos =1;
            fgroup++;
        }
    });


    p.printTable();

    //******************** Finals Tables
    //Check if there are finals to run
    let finalGroups = raceEvent.raceday
        .filter(race=>race.class===className && race.final===1)
        .map(race=>race.group).filter(function(item, pos, self) {
            return self.indexOf(item) === pos;
        }) || [];
    finalGroups.map(group=>{
        let res = sortHeatResults(raceEvent.classes[className].finals.filter(racer=>racer.group===group))

        console.log(`Finals for Group: ${group}\n`);

        cols = [
            {
                name: "group",
                alignment: "center",
                title: "Group"
            },
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
                name: "laptime",
                alignment: "right",
                title: "Lap/Time",
            },
            {
                name: 'fhlt',
                alignment: 'right',
                title: `Fastest Lap Time`,
            }
        ];

        const pf = new Table({
            columns: cols
        });
        pos = 1;
        res.racers.map((racer) => {
            let f =racer.heat[0];
            let out = {group,
                position: pos++,
                name:racer.name,
                laptime: `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}`,
                fhlt: raceEvent.classes[className].userFastestFinal?.[racer.id] || ''
            };

            pf.addRow(out,{separator: 0});

        });

        pf.printTable();
    })


    let ft = raceEvent.classes[className].fastest;
    if(!Array.isArray(ft)){
        ft = [ft,{}];
    }

    console.log(`Fastest Laps:`);
    ft.slice(0,-1).map(ftim=>{
        console.log(` * ${ftim.name} ${ftim.laptime/1000} secs in ${ftim.detail}`);
    })



}

function exportResults(className){
    let schemas=[];
    let dataArr=[];
    let sheets=['Heats'];

    let {racers, heats}  = sortHeatResults(raceEvent.classes[className].results);

    let schema1 = [
        {
            value: racers=> racers.position,
            type: String,
            align: "center",
            column: "POS"
        },
        {
            value: racers=> racers.name,
            align: "left",
            column: "Name",
        },
        {
            value: racers=> racers.points,
            align: "center",
            column: "Points",
        }
    ];

    for(let heat in heats){
        schema1.push({
            value: racers=> racers[heat],
            align: 'right',
            column: `Heat ${heat}`,
        });
    }

    schemas.push(schema1);

    let data = [];
    let pos = 1;
    let fgroup = 1
    let finalSplit = Math.ceil(racers.length / (raceEvent.classes[className]?.split || config.finalGroupSplit));

    racers.map((racer,idx) => {
        let newGroup = (idx && !((idx+1) % finalSplit))
        let out = { position: `${String.fromCharCode(fgroup+64)} ${pos++}`, name:racer.name, points: racer.points };
        for(let heat in heats){
            let f =racer.heat[heat];
            out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}`:'--';
        }
        data.push(out);
        if(newGroup) data.push({});
        if(newGroup){
            pos =1;
            fgroup++;
        }
    });

    dataArr.push(data);




    //******************** Finals Tables
    //Check if there are finals to run
    let finalGroups = raceEvent.raceday
        .filter(race=>race.class===className && race.final===1)
        .map(race=>race.group).filter(function(item, pos, self) {
            return self.indexOf(item) === pos;
        }) || [];
    finalGroups.map(group=>{
        let res = sortHeatResults(raceEvent.classes[className].finals.filter(racer=>racer.group===group))

        let schema2 = [
            {
                value: res=> res.group,
                align: "center",
                column: "Group"
            },
            {
                value: res=> res.position,
                align: "center",
                column: "POS"
            },
            {
                value: res=> res.name,
                align: "left",
                column: "Name",
            },
            {
                value: res=> res.laptime,
                align: "right",
                column: "Lap/Time",
            }
        ];
        schemas.push(schema2);

        let data = [];
        pos = 1;
        res.racers.map((racer) => {
            let f =racer.heat[0];
            let out = {group,
                position: pos++,
                name:racer.name, laptime: `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}` };

            data.push(out);

        });

        dataArr.push(data);

        sheets.push(`Finals Group ${group}`)
    })

    const filename = `./export_${className}_${config.raceEventFile.replace('./','').replace(/^event_/,'')}.xlsx`;
    writeXlsxFile(dataArr, {
        schema: schemas,
        sheets: sheets,
        filePath: filename
    }).then(()=>{
        console.log(`File Exported: ${filename}`);
    });
}

function cleanClass(){
    return {
        fastest:[{laptime:9999999999999}],
        userFastestHeat:{},
        userFastestFinal:{},
        results:[],
        finals:[]
    };
}

