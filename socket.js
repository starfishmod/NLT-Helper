const {io} = require("socket.io-client");
const {sendSerialMessage} = require("./serial");
const {countdown, speakUp} = require("./audio");
const {writeRaceEvent} = require("./fileHandling");


let racers = {};
let times = [];
let lastLap = false;
let hostSupportedEvents = [];

function attemptSocketConnection() {
    if (global.socket && global.socket.connected) {
        return;
    }
    if (!global.config.ip || !global.config.api) {
        return;
    }
    console.log("Connecting to socket\n");
    global.socket = io(`ws://${global.config.ip}:3001/neon-timing?token=${global.config.api}`, {
        transports: ['websocket'],
        upgrade: false,
        reconnectionDelayMax: 2000
    });
    global.socket.on("connect", () => {
        const engine = global.socket.io.engine;
        hostSupportedEvents = [];
        console.log("Connection opened\n");
        sendSerialMessage("NLT Connected");

        engine.on("close", (reason) => {
            hostSupportedEvents = [];
            console.log(`Connection closed - ${reason}\n`);
            sendSerialMessage("NLT Disconnect");
        });
    });
    global.socket.on('host_event', message => {
        if(global.config.debug)console.log('received event from host', message);

        switch(message.cmd) {
            case 'handshake_init':
                if (message.protocol !== 'NT1') {
                    if(global.config.debug)console.log("Protocol is not valid.\n")
                    global.socket.disconnect();
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

function sendSocketEvent(event) {
    if (!global.socket || !global.socket.connected) {
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
    global.socket.emit('client_event', data);
}

module.exports = {
    attemptSocketConnection
}