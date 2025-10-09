
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
    });global.

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

module.exports = {
    cleanClass,
    compareTimes,
    convertMilliSecondToReadable,
    sortHeatResults,
    heatlist:[
        {title:"1",value:1},
        {title:"2",value:2},
        {title:"3",value:3},
        {title:"4",value:1},
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