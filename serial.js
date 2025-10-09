const {SerialPort} = require("serialport");

let portL =[];
function relistSerial(){
    portL =[];
    SerialPort.list().then(ports => {
        ports.forEach(function (port) {
            if (port.path.match(/ttyS[0-9+]/)) return;
            portL.push({
                title: port.path, value: port.path,
                selected: (port.path === global.config.port)
            });
        })
    });
}


function SerialConnect(){
    if(!global.config.port){ return}

    SerialPort.list().then(ports => {
        ports.forEach(function (port) {
            if(port.path!==global.config.port)return;
            global.sPort = new SerialPort({
                path: global.config.port,
                baudRate: 115200,
            });
            global.sPort.open(function (err) {
                if (err) {
                    return console.log('Error opening port: ', err.message)
                }
            });

            // The open event is always emitted
            global.sPort.on('open', function() {
                sendSerialMessage("  Connected");
            });
        });
    });
}

function sendSerialMessage(msg, showConsole = true){
    if(global.sPort)global.sPort.write(msg+"\n");
    if(showConsole)console.log(msg+"\n");
}

relistSerial();



module.exports = {
   serialPorts: portL,
    relistSerial,
    SerialConnect,
    sendSerialMessage

};