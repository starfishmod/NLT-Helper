const vorpal = require('vorpal')();
const {SerialPort} = require('serialport');
const fs = require('fs');
const ntlSocket = require('./nltSocket.js');
const say = require('say');

console.log('NLT Helper ✨');
//say.speak('Happy developing');
say.speak(`NLT Helper`);


const configFileLocation = './config.json';
global.config = fs.existsSync(configFileLocation)?JSON.parse(fs.readFileSync(configFileLocation)):{did : Math.random().toString(36).slice(2),classes:{}} ;

global.writeConfig = function(){
    fs.writeFileSync(configFileLocation, JSON.stringify(global.config,2,2), {flag: 'w+'});
}


let sPort = null;

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
    .command("nextrace [class]", "Set next Class to race ")
    .autocomplete({data: function(input, cb) {
        cb(Object.keys(global.config.classes));
    }})
    .action(function(args, cb){
        if(!global.config.classes[args.class]){
            console.log(`No Class: ${global.config.nextClass}`);
        }else{
            global.config.nextClass = args.class;
            sendSerialMessage(`Line Up: ${global.config.nextClass}`);
            say.stop(()=> {
                say.speak(`  ${global.config.nextClass} class to line up`);
            });
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

        let winnerList = global.config.classes[args.class].results;
        winnerList.sort((a,b)=> {
            if(a.laps !== b.laps){
                return b.laps - a.laps;
            }else{
                return a.elapsed - b.elapsed;
            }
        });

        const filteredArray = filterArrayObject(winnerList, 'name');
        filteredArray.map((f,idx)=> console.log(`${idx+1}: ${f.name} - ${f.laps}:${Number(f.elapsed/1000).toFixed(3)}`));

        console.log(`Fastest Lap: ${global.config.classes[args.class].fastest.name} ${global.config.classes[args.class].fastest.laptime/1000} secs`);
        cb();
    });



//***

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