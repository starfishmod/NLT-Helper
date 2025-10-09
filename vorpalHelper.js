
const prompts = require("prompts");
const {globSync} = require("glob");
const {cleanClass, compareTimes, heatlist, grouplist, sortHeatResults, displayResults, exportResults} = require("./utils");
const {relistSerial, serialPorts, SerialConnect, sendSerialMessage} = require("./serial");
const {speakUp} = require("./audio");
const {writeRaceEvent, writeConfig, loadRaceEventFile} = require("./fileHandling");
const {Table} = require("console-table-printer");







let vorpalHelper = [
    {
        command: 'port',
        description: "Sets the serial port.",
        fields:[
            {
                name: 'port',
                required: true,
                message: 'Choose Serial Port',
                type: 'select',
                choices : serialPorts
            }
        ],
        action: function(args, cb){
            global.config.port = args.port;
            writeConfig();
            SerialConnect();
            cb();
        }
    },
    {
        command: 'apikey',
        description: "Sets the API key.",
        fields:()=>{return [
            {
                name: 'api',
                required: true,
                message: 'API Key',
                type: 'text',
                initial:global.config.api
            }
        ]},
        action: function(args, cb){
            global.config.api = args.api;
            writeConfig();
            attemptSocketConnection();
            cb();
        }
    },
    {
        command: 'ip',
        description: "Sets the IP address of .",
        fields:()=>{return[
            {
                name: 'ip',
                required: true,
                message: 'IP',
                type: 'text',
                initial:global.config.ip
            }
        ]},
        action: function(args, cb){
            global.config.ip = args.ip;
            writeConfig();
            attemptSocketConnection();
            cb();
        }
    },
    {
        command: 'reconnect',
        description: "Reconnect to NLT",
        action: function(args, cb){
            relistSerial();
            attemptSocketConnection();
            cb();
        }
    },
    {
        command: 'debug',
        description: "Debug toggle",
        action: function(args, cb){
            global.config.debug = !global.config.debug;
            console.log(`Debug is ${global.config.debug?'On':'Off'}\n`);
            writeConfig();
            cb();
        }
    },
    {
        command: 'audio',
        description: "Mute/UnMute Audio features.",
        fields:()=>{return [
            {
                name: 'audio',
                required: true,
                noCommand: true,
                message: 'Select Audio Options',
                type: 'multiselect',
                choices : [{
                    title:'Countdown Announcement', value:'countdown',
                    selected: !global.config.mute['countdown']
                },{
                    title:'Fastest in Class Announce', value:'fastestClass',
                    selected: !global.config.mute['fastestClass']
                },{
                    title:'Line Up Announcement', value:'lineup',
                    selected: !global.config.mute['lineup']
                }]
            }
        ];},
        action: function(args, cb){
            const audioTypes = ['countdown','fastestClass','lineup'];
            global.config.mute={};
            audioTypes.map((type) => {
                global.config.mute[type] = (args.audio.indexOf(type) === -1)
            });
            writeConfig();
            cb();
        }
    },
    {
        command: 'newevent',
        description: "Start a new event",
        fields:[
            {
                name: 'eventname',
                required: true,
                message: 'Name of the Event',
                type: 'text',
                noCommand:true
            }
        ],
        action: function(args, cb){
            global.config.raceEventFile = './event_'+args.eventname.replace(/\s+/g,'_')
                .replace(/[^A-Za-z0-9_]]/g,'-');

            global.raceEvent = {
                name: args.eventname,
                classes: {}
            };

            global.config.defaultClasses.map((className) => {
                global.raceEvent.classes[className.value] = cleanClass();
            });
            global.raceEvent.raceday=[];
            writeConfig();
            writeRaceEvent();
            cb();
        }
    },
    {
        command: 'loadevent',
        description: "Load a previous event",
        fields:()=>{
            let jsfiles = globSync('./event_*') || [];
            let choices = [];
            jsfiles.map((file) => {
                try {
                    let event = JSON.parse(fs.readFileSync(file));
                    choices.push({title:event.name, value:file});
                }catch (e) {}
            })

            return [{
                    type: 'select',
                    name: 'eventFile',
                    message: 'Select Event:',
                    choices: choices,
                    noCommand: true
                }];
            },
        action: function(args, cb){
            global.config.raceEventFile = './'+args.eventFile;
            writeConfig();
            loadRaceEventFile();
            cb();
        }
    },
    {
        command: 'clearclasses',
        description: "Clear Class details for the current Event (deprecated)",
        action: function(args, cb){
            Object.keys(global.config.defaultClasses).map((className) => {
                global.raceEvent.classes[className] = cleanClass();
            });
            global.raceEvent.raceday=[];
            writeRaceEvent();
            cb();
        }
    },
    {
        command: 'removeclass',
        description: "Remove a Default Class",
        fields:()=> {
            return [
                {
                    name: 'class',
                    message: 'Class to remove',
                    type: 'select',
                    choices: global.config.defaultClasses
                }
            ];
        },
        action: function(args, cb){
            delete global.config.defaultClasses[args.class];
            writeConfig();
            cb();
        }
    },
    {
        command: 'addclass',
        description: "Add a Default Class",
        fields:()=> {
            return [
                {
                    name: 'class',
                    message: 'Class to add',
                    type: 'text'
                }
            ];
        },
        action: function(args, cb){
            let cval = args.class.replace(/\s+/g,'_')
                .replace(/[^A-Za-z0-9_]]/g,'-');
            if(!global.config.defaultClasses.filter(c=>c.value===cval).length){
                global.config.defaultClasses.push({
                    title:args.class, value:cval
                });
            }
            if(global.raceEvent?.classes && !global.raceEvent.classes[cval]){
                global.raceEvent.classes[cval] = cleanClass();
            }
            writeRaceEvent();
            writeConfig();
            cb();
        }
    },
    {
        command: 'dropheats',
        description: "Heats to drop during Calc",
        fields:()=> {
            return [
                {
                    name: 'dropHeat',
                    message: 'Amount of Heats to Drop',
                    type: 'number',
                    min: 0,
                    max: 10,
                    initial: global.config.dropHeat
                }
            ];
        },
        action: function(args, cb){
            global.config.dropHeat = parseInt(args.dropHeat,10);
            writeConfig();
            cb();
        }
    },
    {
        command: 'points',
        description: "Points for each position from 1st onwards",
        fields:()=> {
            return [
                {
                    name: 'points',
                    message: 'Points from 1st to last (separate by a space)',
                    type: 'list',
                    separator: ' ',
                    initial: global.config.points.join(' ')
                }
            ];
        },
        action: function(args, cb){
            global.config.points = args.points.map(v=>parseInt(v,10));
            writeConfig();
            cb();
        }
    },
    {
        command: 'splitfinals',
        description: "Split each finals into groups.",
        fields:()=> {
            return [
                {
                    name: 'finalsplit',
                    message: 'Split By',
                    type: 'number',
                    min: 2, max: 6
                },
                {
                    name: 'class',
                    message: 'Class to Split',
                    type: 'select',
                    choices: global.config.defaultClasses
                }
            ];
        },
        action: function(args, cb){
            if(args.class){
                if(!global.raceEvent.classes[args.class]){
                    console.log("No Class with that name\n")
                    cb();
                    return;
                }
                global.raceEvent.classes[args.class].split = args.finalsplit;
                writeRaceEvent();
            }else {
                global.config.finalGroupSplit = args.finalsplit;
                writeConfig();
            }
            cb();
        }
    },
    {
        command: 'nextheat',
        description: "Set next Class/Heat and optional Group to race ",
        fields:()=> {
            return [

                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                },
                {
                    name: 'heat',
                    message: 'Heat',
                    type: 'select',
                    choices: heatlist
                },
                {
                    name: 'group',
                    message: 'Group',
                    type: 'select',
                    choices: grouplist
                }
            ];
        },
        action: function(args, cb){
            if(!global.raceEvent?.classes){
                cb();
                return;
            }
            if(global.raceEvent.raceday
                .filter(race=>race.class===args.class
                    && race.group===args.group && race.heat===args.heat).length){
                console.log('This race has already been run');
            }else if(!global.raceEvent.classes[args.class]){
                console.log(`No Class: ${args.class}\n`);
            }else{
                //Display Line up
                let raceList = global.raceEvent.classes[args.class].results.filter(res=>res.heat===args.heat-1 && res.group===(args.group||""));
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

                global.raceEvent.nextClass = args.class;
                global.raceEvent.nextGroup = args.group ;
                global.raceEvent.nextHeat = parseInt(args.heat,10);
                sendSerialMessage(`Line Up: ${global.raceEvent.nextClass}${ global.raceEvent.nextGroup ? ' '+ global.raceEvent.nextGroup:'' }`);
                if(!global.config.mute.lineup)speakUp(`${global.raceEvent.nextClass} class ${ global.raceEvent.nextGroup ? 'Group '+ global.raceEvent.nextGroup:'' } to line up for Heat ${global.raceEvent.nextHeat}`);

            }
            cb();
        }
    },
    {
        command: 'removeheat',
        description: "Remove Previously run Class/Heat and option Group to race ",
        fields:()=> {
            return [

                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                },
                {
                    name: 'heat',
                    message: 'Heat',
                    type: 'select',
                    choices: heatlist
                },
                {
                    name: 'group',
                    message: 'Group',
                    type: 'select',
                    choices: grouplist
                }
            ];
        },
        action: function(args, cb){
            if(global.raceEvent.raceday
                .filter(race=>race.class===args.class
                    && race.group===args.group && race.heat===args.heat).length) {
                this.prompt({
                    type: 'confirm',
                    name: 'confirmDelete',
                    message: `Are you sure you want to delete ${args.class}?`,
                    default: false
                }).then((result) => {
                    if (result.confirmDelete) {
                        // Add actual deletion logic here
                        console.log(`Deleting ${args.class}...\n`);
                        global.raceEvent.raceday = global.config.raceday
                            .filter(race=>race.class!==args.class
                                || race.group!==(args.group||"") || race.heat!==args.heat);

                        global.raceEvent.classes[args.class].results = global.raceEvent.classes[args.class].results
                            .filter(race => (race.group||"")!==(args.group||"") || race.heat!==args.heat);
                        writeRaceEvent();
                    } else {
                        console.log(`Deletion of ${args.class} cancelled.\n`);
                    }
                    cb();
                });
            }else{
                console.log(`Race does not exist.\n`);
                cb();
            }
        }
    },
    {
        command: 'adjustheat',
        description: "Adjust a User result for a race",
        fields:()=> {
            return [
                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                },
                {
                    name: 'heat',
                    message: 'Heat',
                    type: 'select',
                    choices: heatlist
                },
                {
                    name: 'group',
                    message: 'Group',
                    type: 'select',
                    choices: grouplist
                }
            ];
        },
        action: function(args, cb){
            if (!global.raceEvent?.classes) {
                cb();
                return;
            }

            let heat = global.raceEvent.raceday
                .filter(race => race.class === args.class
                    && race.group === (args.group || "") && race.heat === args.heat);

            if (!heat.length) {
                console.log(`This race has not been run\n`);
                cb();
            }
            //Found the race...
            let choices = {};
            global.raceEvent.classes[args.class].results.map((r) => {
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
                global.raceEvent.classes[args.class].results.map((r) => {
                    let id = `${r.transponder}:${r.name}`;
                    if(id === response.id && r.heat === args.heat && r.group === args.group) {
                        r.adjustment = response.alterlap;
                    }
                });
                writeRaceEvent();
                cb();

            }).catch((err) => {
                cb();
            });
        }
    },
    {
        command: 'mergeuser',
        description: "Merge user results for a class",
        fields:()=> {
            return [
                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                }
            ];
        },
        action: function(args, cb){
            if(!global.raceEvent.classes[args.class]){
                console.log(`No Class: ${arg.class}\n`);
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
        }
    },
    {
        command: 'final',
        description: "Set next Class and optional Group for a final race ",
        fields:()=> {
            return [

                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                },
                {
                    name: 'group',
                    message: 'Group',
                    type: 'select',
                    choices: grouplist
                }
            ];
        },
        action: function(args, cb){
            if(!global.raceEvent.classes[args.class]){
                console.log(`No Class: ${arg.class}\n`);
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
                global.raceEvent.nextGroup = args.group;
                global.raceEvent.nextFinal = 1;
                sendSerialMessage(`Final: ${global.raceEvent.nextClass}${ global.raceEvent.nextGroup ? ' '+ global.raceEvent.nextGroup:'' }`);
                if(!global.config.mute.lineup)speakUp(`${global.raceEvent.nextClass} class ${ global.raceEvent.nextGroup ? 'Group '+ global.raceEvent.nextGroup:'' } to line up for the Final`);

            }
            cb();
        }
    },
    {
        command: 'adjustfinal',
        description: "Adjust a User result for a final",
        fields:()=> {
            return [
                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                },
                {
                    name: 'group',
                    message: 'Group',
                    type: 'select',
                    choices: grouplist
                }
            ];
        },
        action: function(args, cb){
            if (!raceEvent?.classes?.[args.class]) {
                cb();
                return;
            }

            let final = raceEvent.raceday
                .filter(race => race.class === args.class
                    && race.group === (args.group || "") && race.final===1);

            if (!final.length) {
                console.log(`This race has not been run\n`);
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
        }
    },
    {
        command: 'results',
        description: "Detail overall position results for a class",
        fields:()=> {
            return [

                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                }
            ];
        },
        action: function(args, cb){
            if(!global.raceEvent?.classes[args.class]){
                cb();
                return;
            }
            displayResults(args.class);
            cb();
        }
    },
    {
        command: 'export',
        description: "Export results for a class",
        fields:()=> {
            return [

                {
                    name: 'class',
                    message: 'Class',
                    type: 'select',
                    choices: global.config.defaultClasses
                }
            ];
        },
        action: function(args, cb){
            if(!global.raceEvent?.classes[args.class]){
                cb();
                return;
            }
            exportResults(args.class);
            cb();
        }
    },
    {
        command: 'allresults',
        description: "Detail results for all classes",
        action: function(args, cb){
            if(!global.raceEvent?.classes){
                cb();
                return;
            }
            Object.keys(global.raceEvent.classes).map(className=>{
                console.log(`${className} Results\n`);

                displayResults(className);
                console.log(`=============================================\n`);
            });

            cb();
        }
    }
];

module.exports = vorpalHelper;
