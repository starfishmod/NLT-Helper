const vorpal = require('vorpal')();
const prompts = require('prompts');

const vorpalHelper = require('./vorpalHelper.js');
const {SerialConnect, sendSerialMessage} = require("./serial");
const {loadConfig, writeRaceEvent, loadRaceEventFile} = require("./fileHandling");
const {attemptSocketConnection} = require("./socket");
const {speakUp} = require("./audio");

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
                if(f.name === fieldName && f.choices){
                    cb(f.choices.map(l=>l.value.toString()));
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
                p.action({...args,...response},cb)
            }).catch((err) => {
                cb();
            });
        }else{
            p.action(args,cb);
        }
    });
});


