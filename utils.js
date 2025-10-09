const writeXlsxFile = require("write-excel-file");
const {Table} = require("console-table-printer");

function cleanClass(){
    return {
        fastest:[{laptime:9999999999999}],
        userFastestHeat:{},
        userFastestFinal:{},
        results:[],
        finals:[]
    };
}

function compareTimes(a,b) {
    a.adjustment =  a.adjustment ||0;
    b.adjustment =  b.adjustment ||0;
    if(a.laps + a.adjustment !== b.laps + b.adjustment){
        return (b.laps + b.adjustment) - (a.laps + a.adjustment);
    }else{
        return a.elapsed - b.elapsed;
    }
}

function convertMilliSecondToReadable (milliSecond) {
    const hours = Math.floor(milliSecond / (1000 * 60 * 60));
    let remainingMilliSecond = milliSecond - (hours * 1000 * 60 * 60);
    const minutes = Math.floor(remainingMilliSecond / (1000 * 60));
    remainingMilliSecond = remainingMilliSecond - (minutes * 1000 * 60);
    const seconds = Math.floor(remainingMilliSecond / 1000);
    remainingMilliSecond = remainingMilliSecond - (seconds * 1000);

    return `${hours?Number(hours).toString(10).padStart(2, '0')+':':''}${Number(minutes).toString(10).padStart(2, '0')}:${Number(seconds).toString(10).padStart(2, '0')}.${Number(remainingMilliSecond).toString(10).padStart(3, '0')}`;
}

function sortHeatResults(winnerList,className){
    let racers = {};
    let heats = {};
    winnerList.map(winner => {
        let id = `${winner.transponder}:${winner.name}`;
        if(!racers[id]){
            racers[id] = {name: winner.name, id: id, heat:{},points:0};
        }
        racers[id].heat[winner.heat || 0] = {laps:winner.laps, elapsed:winner.elapsed, adjustment:winner.adjustment || 0};

        if(!heats[winner.heat || 0]){
            heats[winner.heat || 0] = [];
        }
        heats[winner.heat || 0].push(winner);
    });

    Object.keys(heats).map(heat => {
        heats[heat].sort(compareTimes);

        heats[heat].map((racer,idx)=>{
            //heats[heat][idx].points = pointsAmounts[idx] || 0;
            let id = `${heats[heat][idx].transponder}:${heats[heat][idx].name}` ;
            racers[id].points += global.config.points[idx]  || 0;
            racers[id].heat[heat].points = global.config.points[idx]  || 0;
        });
    })

    racers= Object.values(racers);

    //Recalc points on drop lowest points heats
    racers.map(racer => {
        let points = Object.values(racer.heat).map(a => a.points);
        points.sort((a, b) => b - a);
        points = points.slice(0,(Object.values(heats).length - (global.config.dropHeat || 0))||1);
        racer.points = points.reduce((partialSum, a) => partialSum + a, 0);
    });

    racers.sort((a,b)=> {
        let a_rheats = Object.values(a.heat);
        a_rheats.sort(compareTimes);
        let a_Best = a_rheats[0];

        let b_rheats = Object.values(b.heat);
        b_rheats.sort(compareTimes);
        let b_Best = b_rheats[0];
        a_Best.adjustment = a_Best.adjustment || 0;
        b_Best.adjustment = b_Best.adjustment || 0;
        if(a.points !== b.points){
            return b.points - a.points;
        }else if(a_Best.laps + a_Best.adjustment !== b_Best.laps + b_Best.adjustment){
            return (b_Best.laps + b_Best.adjustment) - (a_Best.laps + a_Best.adjustment);
        }else{
            return a_Best.elapsed - b_Best.elapsed;
        }

    });
    return {racers,heats};
}


function displayResults(className){
    let {racers, heats}  = sortHeatResults(global.raceEvent.classes[className].results,className);
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
    let finalSplit = Math.ceil(racers.length / (global.raceEvent.classes[className]?.split || global.config.finalGroupSplit));
    racers.map((racer,idx) => {
        let newGroup = (idx && !((idx+1) % finalSplit));
        //let id = `${racer.transponder}:${racer.name}`;
        let out = {
            position: `${String.fromCharCode(fgroup+64)} ${pos++}`,
            name:racer.name,
            points: racer.points,
            fhlt: convertMilliSecondToReadable(global.raceEvent.classes[className].userFastestHeat?.[racer.id]) || '--'
        };
        for(let heat in heats){
            let f =racer.heat[heat];
            out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}${f.adjustment?'('+f.adjustment+')':''}`:'--';
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
    let finalGroups = global.raceEvent.raceday
        .filter(race=>race.class===className && race.final===1)
        .map(race=>race.group).filter(function(item, pos, self) {
            return self.indexOf(item) === pos;
        }) || [];
    finalGroups.map(group=>{
        let res = sortHeatResults(global.raceEvent.classes[className].finals.filter(racer=>racer.group===group),className)

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
                laptime: `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}${f.adjustment?'('+f.adjustment+')':''}`,
                //out[heat] = f ? `${f.laps}/${convertMilliSecondToReadable(f.elapsed)}${f.adjustment?'('+f.adjustment+')':''}`:'--';
                fhlt: convertMilliSecondToReadable(global.raceEvent.classes[className].userFastestFinal?.[racer.id]) || ''
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

module.exports = {
    cleanClass,
    compareTimes,
    convertMilliSecondToReadable,
    sortHeatResults,
    displayResults,
    exportResults,
    heatlist:[
        {title:"1",value:1},
        {title:"2",value:2},
        {title:"3",value:3},
        {title:"4",value:4},
        {title:"5",value:5},
        {title:"6",value:6}
    ],
    grouplist:[
        {title:"A",value:"A"},
        {title:"B",value:"B"},
        {title:"C",value:"C"},
        {title:"D",value:"D"},
        {title:"E",value:"E"},
        {title:"F",value:"F"}
    ]

};