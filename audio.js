const wav = require('wav');
const Speaker = require('speaker');
const {platform} = require("node:os");
const say = require('say');

let speaking = false;
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
    if(global.config.mute.countdown)return;
    const file = fs.createReadStream(__dirname+'/countdown.wav');
    const reader = new wav.Reader();

    reader.on('format', (format) => {
        reader.pipe(new Speaker(format));
    });
    file.pipe(reader);
}

module.exports = {countdown, speakUp};
