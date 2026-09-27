import { FINALE_DELAY, FINALE_FIREBALL_CAP, HOMING_ATTACK_TUNING, roundHealth } from './balance.js';
export { FINALE_DELAY } from './balance.js';

// The hidden encore stays inside sector ten's existing attempt and checkpoint.
// It owns no profile data; the ultimate form disappears when the run is reset.
export const FINALE_NODES=Object.freeze([
 Object.freeze({x:145,y:390,r:22}),Object.freeze({x:575,y:390,r:22}),
 Object.freeze({x:235,y:590,r:22}),Object.freeze({x:485,y:590,r:22}),
 Object.freeze({x:145,y:790,r:22}),Object.freeze({x:575,y:790,r:22}),
]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function finaleHealth(game){
 const ranks=game.rank-1,multiplier=1+ranks*.25,count=1+Math.round(ranks/3);
 // Fixed durability reference: rank scales the hull, but weapon rebalances never do.
 const combined=500*multiplier*count+200*multiplier*(1+ranks/3);
 return roundHealth(Math.max(20000,combined*60));
}

export function queueFinale(game,boss){
 if(!boss||boss.hp>0)return false;
 if(boss.secret){
  if(game.finale){game.finale.state='complete';game.finale.completed=true;game.finale.ultimate=false;}
  return false;
 }
 if(game.state!=='playing'||game.stageId!==10||boss.midboss||game.finale)return false;
 game.finale={state:'waiting',delay:FINALE_DELAY,ultimate:true,transformProgress:0,elapsed:0,completed:false};
 game.boss=null;game.bossDefeated=false;game.clearTime=0;
 game.player.hp=game.player.maxHp;game.player.invincible=Math.max(game.player.invincible,FINALE_DELAY+2);
 game.transform=null;game.player.shotTimer=0;
 game.systems.missiles.cooldown=0;game.systems.missiles.active=0;
 game.banner={title:'One last light',sub:'All systems awakening',life:FINALE_DELAY};
 game.emit('finaleAwakening');return true;
}

export function updateFinale(game,dt){
 const f=game.finale;
 if(!f||game.state!=='playing'||f.completed)return;
 if(f.state==='waiting'){
  f.delay=Math.max(0,f.delay-dt);f.transformProgress=1-f.delay/FINALE_DELAY;
  if(f.delay>1e-8)return;
  f.delay=0;f.transformProgress=1;f.state='active';
  const hp=finaleHealth(game);
  game.boss={name:'SOLSTICE',secret:true,patternId:11,phaseCount:3,phase:1,phaseShield:0,x:360,y:-100,r:92,hp,maxHp:hp,age:0,fire:1.8,specialTimer:3.5,specialCount:0,hurt:0,volley:0,charging:false};
  game.player.invincible=Math.max(game.player.invincible,2);
  game.banner={title:'SOLSTICE',sub:'All systems online',life:3};game.emit('finale');
 }else f.elapsed+=dt;
}

function addFireball(game,boss,{x=boss.x,y=boss.y+45,angle,speed=80,r=17,warning=.75,tracking=2,turnRate=.18,life=8,delay=0,continuous=false}={}){
 if(game.hazards.filter(h=>h.finaleFireball&&h.life>0).length>=FINALE_FIREBALL_CAP)return;
 game.hazards.push({type:'homingOrb',finaleFireball:true,continuous,color:continuous?'purple':'coral',x,y,r,angle:angle??Math.atan2(game.player.y-y,game.player.x-x),speed:speed*HOMING_ATTACK_TUNING.speed,warning,tracking:continuous?Infinity:tracking,turnRate:turnRate*HOMING_ATTACK_TUNING.turnRate,life,delay,age:0,source:boss,blockedUntil:0});
}

export function enterFinalStand(game){
 const b=game.boss;
 if(!b?.secret||b.finalStand)return;
 b.finalStand=true;b.finalStandAge=0;b.finalStandVolley=0;b.fire=.48;b.specialTimer=Infinity;
 const h={type:'weakpoints',finale:true,nodes:FINALE_NODES.map(node=>({...node,originX:node.x,originY:node.y,touched:false})),warning:1.2,life:Infinity,age:0,source:b,blockedUntil:0};
 b.coreLock=h;game.hazards.push(h);
 // The curtain begins above and beside the reachable nodes, with a full warning.
 for(let i=0;i<12;i++)addFireball(game,b,{x:45+i*630/11,y:180,angle:Math.PI/2+(i-5.5)*.045,speed:72,r:17,warning:1.2,continuous:true});
 for(const x of [24,696])for(const y of [280,470,660])addFireball(game,b,{x,y,speed:110,r:17,warning:1.3,tracking:1.2,turnRate:.24,life:5.5});
 game.banner={title:'Touch every light',sub:'Break the shield, then destroy the core',life:4};game.emit('finalStand');
}

export function exposeFinalCore(game,hazard){
 const b=game.boss;
 if(!b?.secret||!b.finalStand||b.coreLock!==hazard||!hazard.nodes.every(node=>node.touched))return false;
 hazard.life=0;b.coreLock=null;b.coreExposed=true;b.phaseShield=0;
 b.fire=Math.min(b.fire,.2);
 game.ring(b.x,b.y,'#edf0d3',300,.75);
 game.banner={title:'Core exposed',sub:'Finish the fight',life:3};game.emit('coreOpen');return true;
}

export function updateFinalBoss(game,dt){
 const b=game.boss;
 if(!b?.secret||b.hp<=0)return;
 b.age+=dt;b.hurt=Math.max(0,b.hurt-dt);b.phaseShield=Math.max(0,(b.phaseShield||0)-dt);
 const targetY=b.finalStand?190:155,targetX=360+Math.sin(b.age*.32)*75;
 b.y+=(targetY-b.y)*Math.min(1,dt*1.5);b.x+=(targetX-b.x)*Math.min(1,dt*1.8);
 if(b.phase===3&&!b.finalStand)enterFinalStand(game);
 if(b.coreLock?.life>0&&!game.hazards.includes(b.coreLock))game.hazards.push(b.coreLock);
 b.fire-=dt;b.specialTimer-=dt;
 if(b.y<90)return;
 if(b.finalStand){
  b.finalStandAge+=dt;
  if(b.fire<=0){
   const intensity=Math.min(3,Math.floor(b.finalStandAge/8)),volley=b.finalStandVolley++,exposed=b.coreExposed?1:0;
   if(volley%2===0){
    const count=3+Math.floor(intensity/2)+exposed;
    for(let i=0;i<count;i++){
     const offset=i-(count-1)/2,x=clamp(b.x+offset*46,45,675);
     const angle=Math.atan2(game.player.y-b.y,game.player.x-x)+offset*.28+Math.sin(b.finalStandAge*1.7)*.4;
     addFireball(game,b,{x,y:b.y+35,angle,speed:88+intensity*5+exposed*7,r:16,warning:.6,continuous:true,turnRate:.24,life:7.5,delay:i*.035});
    }
   }else{
    const count=5+intensity+exposed*2;
    for(let i=0;i<count;i++){
     const x=(volley+i)%2?24:696,y=260+((Math.floor(volley/2)+i)%3)*185;
     const angle=Math.atan2(game.player.y-y,game.player.x-x)+(i%3-1)*.14;
     addFireball(game,b,{x,y,angle,speed:120+intensity*5+exposed*8,r:16,warning:.7,tracking:1.15,turnRate:.24,life:5.5,delay:i*.07});
    }
   }
   b.fire=(.48-intensity*.02)*(exposed?.82:1);b.volley++;game.emit('enemyShoot');
  }
  return;
 }
 if(b.fire<=0){
  const count=b.phase===1?9:13,spread=b.phase===1?2.2:2.6;
  game.bossFan(b,Math.PI/2+Math.sin(b.age*.8)*.18,count,spread,b.phase===1?95:120,'gold');
  b.fire=b.phase===1?1.6:1.15;b.volley++;game.emit('enemyShoot');
 }
 if(b.phase===2&&b.specialTimer<=0){
  // Stagger four lanes so the denser pursuit is readable and can be threaded.
  for(const [i,offset] of [-125,125,-65,65].entries())
   addFireball(game,b,{x:b.x+offset,y:b.y+30,speed:78,r:22,warning:1.25,tracking:2.4,turnRate:.18,delay:i*.12});
  b.specialTimer=1.8;
 }
}
