const {io}  = require("socket.io-client");
const fs = require('fs');
const wav = require('wav');
const Speaker = require('speaker');

const say = require('say');

let racers = {};
let times = [];
let lastLap = false;
class SocketClient {
    constructor(  ) {
        this.socket = null;
        this.hostSupportedEvents = [];
        this.clientSupportedEvents = ['race','flag','gate','log'];
        this.attemptConnection();

    }

    attemptConnection() {
        if (this.socket && this.socket.connected) {
            //console.log('Stopping previous connection attempt');
            //this.socket.disconnect();
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
                                    //Ready
                                    global.sendSerialMessage("   SET");
									
                                    break;
                                case 'countdown_end_delay_started':
                                    //Set
                                  //  global.sendSerialMessage("   SET ");
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
                                        //let time = Number((message.time - racers[message.transponder])/1000).toFixed(2);
                                        
                                        //times.unshift(time);
                                        //times = times.slice(0,3)
                                        //if(!lastLap)global.sendSerialMessage(times.join(' '));
										racers[message.transponder].streak = message.streak;
                                    }
                                    //racers[message.transponder] = message.time;*/
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
                                                    say.stop(()=>{
                                                        say.speak(`${racers[message.transponder].name} has fastest lap of ${Number(racers[message.transponder].laptime/1000).toFixed(2)} seconds for ${global.config.nextClass} class!`);
                                                    });
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

module.exports = SocketClient;


function countdown(){

    const file = fs.createReadStream('./countdown.wav');
    const reader = new wav.Reader();

    reader.on('format', (format) => {
        reader.pipe(new Speaker(format));
    });


    file.pipe(reader);
}