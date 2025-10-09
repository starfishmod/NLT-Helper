const configVersion = 4;
const configFileLocation = './config.json';


function loadConfig(){
    let fConf = fs.existsSync(configFileLocation)?JSON.parse(fs.readFileSync(configFileLocation)):{};
    let prevVer = fConf.version || 0;
    global.config = {
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
        for(let i in global.config.classes){
            if(!global.config.classes[i].finals)
                global.config.classes[i].finals = [];
        }

        //let's move to version 1
        global.config.defaultClasses = Object.keys(global.config.classes);
        global.config.raceEventFile = "";
        prevVer = 1;
    }

    if(prevVer === 1){
        //Cleanup Classes
        let dClass = {};
        global.config.defaultClasses.map(classN=>{dClass[classN]={};});
        global.config.defaultClasses = dClass;
        prevVer = 2;
    }

    if(prevVer === 2){
        prevVer = 3;
    }

    if(prevVer === 3){
        //Cleanup Classes
        let dClass4 = [];
        Object.keys(global.config.defaultClasses).map((cl) => {
            dClass4.push({title:cl, value:cl});
        });
        global.config.defaultClasses = dClass4;
        prevVer = 4;
    }

    global.config.version = configVersion;
}

function loadRaceEventFile(){
    if(!global.config.raceEventFile){
        console.log("No Race Event file found, cannot load RaceEventFile. Please use \"newevent\" command");
        return;
    }
    let raceeventFile = fs.existsSync(global.config.raceEventFile)?fs.readFileSync(global.config.raceEventFile):null;
    if(!raceeventFile){
        console.log("Race Event File not Found. Please use \"newevent\" or \"loadevent\" command");
        return
    }

    global.raceEvent = JSON.parse(raceeventFile);
    console.log(`Loading Race Event file: ${global.raceEvent.name}`);
}

function writeConfig(){
    fs.writeFileSync(configFileLocation, JSON.stringify(global.config,2,2), {flag: 'w+'});
}

function writeRaceEvent(){
    fs.writeFileSync(global.config.raceEventFile, JSON.stringify(global.raceEvent,2,2), {flag: 'w+'});
}

module.exports = {
    loadConfig,
    writeConfig,
    loadRaceEventFile,
    writeRaceEvent
}