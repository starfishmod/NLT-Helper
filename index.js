const vorpal = require('vorpal')();
const fs = require('fs');

const {io}  = require("socket.io-client");
const { Table } = require("console-table-printer");

const { globSync} = require("glob");
const writeXlsxFile = require('write-excel-file/node')
const prompts = require('prompts');

const vorpalHelper = require('./vorpalHelper.js');
const { convertMilliSecondToReadable, sortHeatResults} = require("./utils");
const {SerialConnect, sendSerialMessage} = require("./serial");
const {countdown, speakUp} = require("./audio");
const {loadConfig, writeRaceEvent, loadRaceEventFile} = require("./fileHandling");


let racers = {};
let times = [];
let lastLap = false;

//let sPort = null;
let socket = null;
let hostSupportedEvents = [];

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

vorpalHelper.map(p=>{
    let comm = p.command;
    let ac = false;
    let fields = typeof p.fields  === 'function'?p.fields():p.fields || [];
    fields.map(field => {
        if(!field.noCommand)comm += ` [${field.name}${field.type==='list'?'...':''}]`;
        if(field.choices && !field.noCommand)ac = true;
    });
    let v = vorpal.command(comm,p.description);
    if(ac){
        v.autocomplete((input, cb,fieldName)=>{
            fields = typeof p.fields  === 'function'?p.fields():p.fields || [];
            for(const f of fields){
                if(f.name === fieldName){
                    cb(f.choices.map(l=>l.value));
                    return;
                }
            }
            cb();
        });
    }
    v.action((args, cb)=>{
        let prom=[];
        fields = typeof p.fields  === 'function'?p.fields():p.fields || [];
        fields.map(field => {
            if(!args[field.name])prom.push(field);
        })
        if(prom.length){
            prompts(prom).then((response) => {
                p.action(response,cb)
            }).catch((err) => {
                cb();
            });
        }else{
            p.action(args,cb);
        }
    });
});






vorpal
    .command("adjustfinal <class> [group]", "Adjust a User result for a race")
    .types({
        string: ['class','group']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb, arg) {
            if(arg === 'class') {
                cb(Object.keys(raceEvent.classes));
            }else if(arg === 'group') {
                cb(["A","B","C","D","E","F"]);
            }else{
                cb([]);
            }
        }})
    .action(function(args, cb) {
        if (!raceEvent?.classes?.[args.class]) {
            cb();
            return;
        }

        let final = raceEvent.raceday
            .filter(race => race.class === args.class
                && race.group === (args.group || "") && race.final===1);

        if (!final.length) {
            this.log('This race has not been run');
            cb();
        }
        //Found the race...
        let choices = {};
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
                message: 'Select User to Alter:',
                choices: Object.values(choices)
            },
            {
                type: 'number',
                name: 'alterlap',
                initial: 0,
                message: 'How Many lap to add/remove?:'
            }
        ]).then((response) => {
            raceEvent.classes[args.class].finals.map((r) => {
                let id = `${r.transponder}:${r.name}`;
                if(id === response.id && r.group === args.group) {
                    r.adjustment = response.alterlap;
                }
            });


            writeRaceEvent();
            cb();

        }).catch((err) => {
            cb();
        });




    });

vorpal
    .command("allresults", "Detail results for all classes")
    .action(function(args, cb){
        if(!global.raceEvent?.classes){
            cb();
            return;
        }
        Object.keys(global.raceEvent.classes).map(className=>{
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
            cb(Object.keys(global.raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!global.raceEvent?.classes[args.class]){
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
            cb(Object.keys(global.raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!global.raceEvent?.classes[args.class]){
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
            if(!global.raceEvent?.classes){
                cb();
                return;
            }
            if(arg === 'class') {
                cb(Object.keys(global.raceEvent.classes));
            }else if(arg === 'group') {
               // let spf = (raceEvent.classes[args.class]?.split || config.finalGroupSplit);
                cb(["A","B","C","D","E","F"]/*.slice(0,spf)*/);
            }else{
                cb([]);
            }
                }})
    .action(function(args, cb){
        if(!global.raceEvent.classes[args.class]){
            this.log(`No Class: ${arg.class}`);
        }else{
            //Display Line up
            let {racers, heats}  = sortHeatResults(global.raceEvent.classes[args.class].results,args.class);
            let finalSplit = Math.ceil(racers.length / (global.raceEvent.classes[args.class]?.split || global.config.finalGroupSplit));
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


            global.raceEvent.nextClass = args.class;
            global.raceEvent.nextGroup = args.group || '';
            global.raceEvent.nextFinal = 1;
            sendSerialMessage(`Final: ${global.raceEvent.nextClass}${ global.raceEvent.nextGroup ? ' '+ global.raceEvent.nextGroup:'' }`);
            if(!global.config.mute.lineup)speakUp(`${global.raceEvent.nextClass} class ${ global.raceEvent.nextGroup ? 'Group '+ global.raceEvent.nextGroup:'' } to line up for the Final`);

        }
        cb();
    });


vorpal
    .command("mergeuser <class>", "Merge user results for a class")
    .types({
        string: ['class']//,  integer: ['heat']
    })
    .autocomplete({data: function(input, cb, arg) {
        cb(Object.keys(global.raceEvent.classes));
        }})
    .action(function(args, cb){
        if(!global.raceEvent.classes[args.class]){
            this.log(`No Class: ${arg.class}`);
            cb();
            return;
        }


        let choices = {};
        global.raceEvent.classes[args.class].results.map((r) => {
            let id = `${r.transponder}:${r.name}`;
            if(!choices[id]){
                choices[id] = {title:id, value:id};
            }
        });

        global.raceEvent.classes[args.class].finals.map((r) => {
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
            global.raceEvent.classes[args.class].results.map((r) => {
                    let id =`${r.transponder}:${r.name}`;
                    if(id === response.id){
                       r.name=newname;
                       r.transponder=newtransponder;
                    }
                });

            global.raceEvent.classes[args.class].finals.map((r) => {
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






function attemptSocketConnection() {
    if (socket && socket.connected) {
        return;
    }
    if (!global.config.ip || !global.config.api) {
        return;
    }
    console.log("Connecting to socket\n");
    socket = io(`ws://${global.config.ip}:3001/neon-timing?token=${global.config.api}`, {
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
        if(global.config.debug)console.log('received event from host', message);

        switch(message.cmd) {
            case 'handshake_init':
                if (message.protocol !== 'NT1') {
                    if(global.config.debug)console.log("Protocol is not valid.\n")
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

                                if(global.raceEvent.nextClass){
                                    if(global.raceEvent.nextHeat){
                                        global.raceEvent.classes[global.raceEvent.nextClass].results.push(
                                            ...winnerList
                                        );

                                        global.raceEvent.raceday.push({
                                            class:global.raceEvent.nextClass,
                                            heat:global.raceEvent.nextHeat,
                                            group:global.raceEvent.nextGroup,
                                            adjustment:{}
                                        });
                                        delete global.raceEvent.nextHeat;
                                    }
                                    if(global.raceEvent.nextFinal){
                                        global.raceEvent.classes[global.raceEvent.nextClass].finals.push(
                                            ...winnerList
                                        );

                                        global.raceEvent.raceday.push({
                                            class:global.raceEvent.nextClass,
                                            final:global.raceEvent.nextFinal,
                                            group:global.raceEvent.nextGroup
                                        });
                                        delete global.raceEvent.nextFinal;
                                    }
                                    delete global.raceEvent.nextClass;

                                    delete global.raceEvent.nextGroup;
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
                                    if(global.raceEvent.nextHeat){
                                        racers[message.transponder].heat = global.raceEvent.nextHeat;
                                        racers[message.transponder].group = global.raceEvent.nextGroup;
                                    }
                                    if(global.raceEvent.nextFinal){
                                        racers[message.transponder].final = global.raceEvent.nextFinal;
                                        racers[message.transponder].group = global.raceEvent.nextGroup;
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

                                if(global.raceEvent.nextClass && racers[message.transponder].laptime){
                                    if(global.raceEvent.classes[global.raceEvent.nextClass].fastest[0].laptime > racers[message.transponder].laptime){

                                        if(global.raceEvent.classes[global.raceEvent.nextClass].fastest[0].laptime !== 9999999999999){
                                            if(!global.config.mute.fastestClass)speakUp(`${racers[message.transponder].name} has fastest lap of ${Number(racers[message.transponder].laptime/1000).toFixed(2)} seconds for ${global.raceEvent.nextClass} class!`);
                                        }

                                        global.raceEvent.classes[global.raceEvent.nextClass].fastest.unshift({
                                            laptime: racers[message.transponder].laptime,
                                            name: racers[message.transponder].name,
                                            detail: `${global.raceEvent.nextHeat?'Heat '+ global.raceEvent.nextHeat:'Final'} ${global.raceEvent.nextGroup?'Group '+global.raceEvent.nextGroup:''}`
                                        });
                                    }

                                    let id = `${message.transponder}:${message.name}`;
                                    if(global.raceEvent.nextHeat &&
                                        (
                                            !global.raceEvent.classes[global.raceEvent.nextClass].userFastestHeat[id]
                                        || global.raceEvent.classes[global.raceEvent.nextClass].userFastestHeat[id] > racers[message.transponder].laptime
                                        )
                                        ){
                                        global.raceEvent.classes[global.raceEvent.nextClass].userFastestHeat[id] =  racers[message.transponder].laptime;
                                    }
                                    if(global.raceEvent.nextFinal &&
                                        (
                                            !global.raceEvent.classes[global.raceEvent.nextClass].userFastestFinal[id]
                                            || global.raceEvent.classes[global.raceEvent.nextClass].userFastestFinal[id] > racers[message.transponder].laptime
                                        )
                                    ){
                                        global.raceEvent.classes[global.raceEvent.nextClass].userFastestFinal[id] =  racers[message.transponder].laptime;
                                    }
                                    //writeRaceEvent();
                                }
                                break;
                        }
                        break;
                }
                break;
        }

        if (message.cmd === 'handshake_init') {}
    });
}
global.attemptSocketConnection = attemptSocketConnection;

function sendSocketEvent(event) {
    if (!socket || !socket.connected) {
        if(global.config.debug)console.log('socket is not connected, cannot send message');
        return;
    }
    if (event.evt && !hostSupportedEvents.includes(event.evt)) {
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
    socket.emit('client_event', data);
}

function displayResults(className){
    let {racers, heats}  = sortHeatResults(raceEvent.classes[className].results,className);
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
    let finalSplit = Math.ceil(racers.length / (raceEvent.classes[className]?.split || global.config.finalGroupSplit));
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
            out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}${f.adjustment?'('+f.adjustment+'adj)':''}`:'--';
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
        let res = sortHeatResults(raceEvent.classes[className].finals.filter(racer=>racer.group===group),className)

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

    let {racers, heats}  = sortHeatResults(raceEvent.classes[className].results,className);

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
    let finalSplit = Math.ceil(racers.length / (raceEvent.classes[className]?.split || global.config.finalGroupSplit));

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
        let res = sortHeatResults(raceEvent.classes[className].finals.filter(racer=>racer.group===group),className)

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

    const filename = `./export_${className}_${global.config.raceEventFile.replace('./','').replace(/^event_/,'')}.xlsx`;
    writeXlsxFile(dataArr, {
        schema: schemas,
        sheets: sheets,
        filePath: filename
    }).then(()=>{
        console.log(`File Exported: ${filename}`);
    });
}

