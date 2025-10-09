
const prompts = require("prompts");
const {globSync} = require("glob");
const {cleanClass, compareTimes, heatlist, grouplist} = require("./utils");
const {relistSerial, serialPorts, SerialConnect, sendSerialMessage} = require("./serial");
const {speakUp} = require("./audio");
const {writeRaceEvent, writeConfig, loadRaceEventFile} = require("./fileHandling");







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
            global.attemptSocketConnection();
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
            global.attemptSocketConnection();
            cb();
        }
    },
    {
        command: 'reconnect',
        description: "Reconnect to NLT",
        action: function(args, cb){
            relistSerial();
            global.attemptSocketConnection();
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

            Object.keys(global.config.defaultClasses).map((className) => {
                global.raceEvent.classes[className] = cleanClass();
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
                    this.log("No Class with that name")
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
                this.log('This race has already been run');
            }else if(!global.raceEvent.classes[args.class]){
                this.log(`No Class: ${arg.class}`);
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
                        this.log(`Deleting ${args.class}...`);
                        global.raceEvent.raceday = global.config.raceday
                            .filter(race=>race.class!==args.class
                                || race.group!==(args.group||"") || race.heat!==args.heat);

                        global.raceEvent.classes[args.class].results = global.raceEvent.classes[args.class].results
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
                this.log('This race has not been run');
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
    }
];

module.exports = vorpalHelper;
