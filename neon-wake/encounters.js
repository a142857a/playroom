import { BOSS_PHASE_SHIELD_DURATION, CORE_OPEN_DURATION, sectorTuning, HOMING_ATTACK_TUNING } from './balance.js';
export { BOSS_PHASE_SHIELD_DURATION, CORE_OPEN_DURATION } from './balance.js';
import { updateFinalBoss, enterFinalStand, exposeFinalCore } from './finale.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BOSS_RECOVERY_SPEED = 460;
export function pace(stage, time, duration) {
  const progress = clamp(time / duration, 0, 1), tuning=sectorTuning(stage);
  const intensity = stage === 1 ? .18 + .5 * progress ** 1.8 : stage === 2 ? .52 + .58 * progress : 1 + (stage - 3) * .12;
  const lull = progress >= .43 && progress < .52 || stage >= 3 && progress >= .76 && progress < .81;
  return {intensity, lull, interval: (3.0 - Math.min(1.3,intensity) * 1.4) * (lull ? 2.2 : 1) * tuning.spawnInterval / tuning.normalDensity, speed: .82 + intensity * .62, fire: (1.05 - Math.min(1.3,intensity) * .40) * (lull ? 1.8 : 1) * tuning.fireInterval};
}

function nextPhaseHealth(boss) {
  const count=boss.phaseCount||2;
  return boss.phase>=count ? 0 : boss.maxHp*(count===2?.45:1-boss.phase/count);
}

function beginBossPhase(game) {
  const b=game.boss,threshold=nextPhaseHealth(b);
  if(!threshold || b.hp>threshold || b.phaseShield>0)return;
  // A single impact cannot consume the next phase before its shield appears.
  b.hp=threshold;b.phase++;b.phaseShield=BOSS_PHASE_SHIELD_DURATION;
  if(b.secret&&b.phase===3)enterFinalStand(game);
  if((b.patternId||game.stageId)===10&&b.phase===5)b.coreCycle=false;
  game.ring(b.x,b.y,'#e8bf91',170,.5);
  game.emit('bossPhase',{phase:b.phase});
}

export function damageBoss(game,damage,hurt=.1) {
  const b=game.boss;
  if(!b || b.hp<=0 || b.phaseShield>0 || b.coreLock?.life>0 || !(damage>0))return 0;
  const before=b.hp;
  b.hp=Math.max(nextPhaseHealth(b),b.hp-damage);b.hurt=hurt;
  beginBossPhase(game);
  return before-b.hp;
}

function weakpointLock(game,repeat=true) {
  const b=game.boss;
  if(b.coreLock?.life>0)return;
  const cycle=b.coreLocks=(b.coreLocks||0)+1;
  const h={type:'weakpoints',nodes:[{x:170,y:cycle%2?500:740,r:25,touched:false},{x:550,y:cycle%2?750:510,r:25,touched:false}],warning:1.2,life:Infinity,age:0,source:b,blockedUntil:0};
  b.coreLock=h;b.coreOpen=0;b.coreCycle=repeat;game.hazards.push(h);
  game.banner={title:'Touch both nodes',sub:'Open the armored core',life:3};
}

export function bossSpecial(game) {
  const b = game.boss, n = b.specialCount++, stage = b.patternId||game.stageId;
  const tier=game.stageId>=9?2:game.stageId>=7?1:0;
  const add = hazard => game.hazards.push({warning:2,life:1,age:0,source:b,blockedUntil:0,...hazard});
  const shutter=(width=140)=>{const x=[100,280,460,280][n%4];add({type:'field',rects:[{x:0,y:100,w:x,h:800},{x:x+width,y:100,w:720-x-width,h:800}],safe:{x,y:100,w:width,h:800},life:2.5});};
  const gates=(count=stage>=10?5:stage>=7?(b.phase>=3?5:4):b.phase>=2?4:2)=>{
    const gapWidth=count>=5?100:count>=4?120:140;
    for(let i=0;i<count;i++){
      const center=[180,360,540,360][(n+i)%4];
      add({type:'gate',x:0,y:180,w:720,h:80,gapX:center-gapWidth/2,gapWidth,speed:200,delay:i*1.5,life:5});
    }
  };
  const meteors=()=>{
    const count=game.stageId>=7?4:game.stageId>=5?3:2,r=[120,100,75][count-2];
    for(let i=0;i<count;i++){
      const mirror=(stage===6||stage===9?Math.floor(n/2):n)%2;
      const lane=mirror?count-1-i:i;
      add({type:'meteor',x:(lane+.5)*720/count,y:-r-30,r,speed:300,delay:i*.75,warning:0,life:4.5});
    }
  };
  const cross=()=>add({type:'cross',x:360,y:220,angle:n%2?Math.PI/4:0,rotation:b.phase===1?0:(n%2?-1:1)*.2,width:25,length:1200,life:4});
  const sweep=()=>add({type:'sweepLaser',x:n%2?640:80,y:100,endY:900,width:20,gapY:n%3===2?400:600,gapHeight:140,vx:n%2?-120:120,life:560/120});
  const rotor=()=>add({type:'rotor',x:360,y:350,angle:-Math.PI/2+(n%2)*Math.PI/(4+tier*4),rays:4+tier*4,rotation:(n%2?-1:1)*[1.25,.75,.5][tier],width:20,innerRadius:100+tier*20,length:1100,life:6,quiet:true});
  const orbs=()=>{const count=b.phase>=3?3:2,existing=game.hazards.filter(h=>h.type==='homingOrb'&&h.continuous&&!h.enemyProjectile&&h.life>0).length;for(let i=0;i<Math.min(count,3-existing);i++){const x=count===2?(i?620:100):[100,620,360][i],y=200;add({type:'homingOrb',continuous:true,color:'purple',x,y,r:25,angle:Math.atan2(game.player.y-y,game.player.x-x),speed:100*HOMING_ATTACK_TUNING.speed,turnRate:.3*HOMING_ATTACK_TUNING.turnRate,tracking:Infinity,warning:1.5,life:8,delay:i*.75});}};
  if (stage === 1) {
    for (const dx of [-80,0,80])game.spawn('scout',b.x+dx,b.y+50,{fire:1.1,speed:90,lootEligible:false});
    game.banner={title:'Escorts incoming',sub:'',life:2};
  } else if (stage === 2) {
    if(b.phase>=2)sweep();else shutter();
  } else if (stage === 3) {
    meteors();
  } else if (stage === 4) {
    if(b.phase>=2&&n%3===2)cross();
    else{
      const endX = clamp(game.player.x,100,620), endY=clamp(game.player.y,450,750);
      add({type:'charge',x:b.x,y:b.y,endX,endY,width:220,warning:1.5,life:.75,maxLife:.75});
      b.charging=true;
    }
  } else if (stage === 5) {
    if(b.phase>=2&&n%2===0)rotor();else gates();
  } else if(stage===6) {
    if(n%2)meteors();
    else{
      const safe={x:[100,280,460,280][Math.floor(n/2)%4],y:500,w:160,h:250};
      add({type:'field',rects:[{x:0,y:100,w:720,h:safe.y-100},{x:0,y:safe.y,w:safe.x,h:900-safe.y},{x:safe.x+safe.w,y:safe.y,w:720-safe.x-safe.w,h:900-safe.y},{x:safe.x,y:safe.y+safe.h,w:safe.w,h:900-safe.y-safe.h}],safe,life:2.5});
    }
  } else if(stage===7){
    const pattern=(n+b.phase-1)%3;
    if(pattern===0)shutter(b.phase>=3?120:140);else if(pattern===1)gates();else rotor();
  } else if(stage===8){
    if(!b.coreCycle&&n%2===1)weakpointLock(game);
    else if(b.phase>=3&&n%3===2)rotor();else cross();
  } else if(stage===9){
    orbs();
    if(n%2)meteors();else if(b.phase>=3&&n%4===2)gates(4);
  } else if(stage===10){
    const pattern=b.phase<5?b.phase-1:n%7;
    if(pattern===0){if(b.phase<5&&n%2)gates();else sweep();}
    if(pattern===1){if(b.phase<5&&n%2)cross();else rotor();}
    if(pattern===2){orbs();if(n%2)meteors();}
    if(pattern===3){if(b.coreOpen>0)cross();else weakpointLock(game,b.phase===4);}
    if(pattern===4)cross();
    if(pattern===5)meteors();
    if(pattern===6)gates();
  }
  b.specialTimer=Math.max(4,[10,5,7,5,7,7,8,8,8,8][stage-1]-(b.phase-1)*.5);
}

// The hull advances before this frame's guns fire. Keeping the charge clock here
// prevents both a stale firing origin and a second movement step in updateHazards.
function advanceBossCharge(game,dt){
  const b=game.boss,h=game.hazards.find(h=>h.type==='charge'&&h.source===b&&h.life>0);
  if(!h)return;
  h.age+=dt;
  let travel=dt;
  if(h.warning>0){travel=Math.max(0,dt-h.warning);h.warning=Math.max(0,h.warning-dt);}
  if(travel<=0)return;
  h.life=Math.max(0,h.life-travel);
  const progress=clamp(1-h.life/h.maxLife,0,1);
  b.x=h.x+(h.endX-h.x)*progress;b.y=h.y+(h.endY-h.y)*progress;
  if(h.life===0){b.charging=false;b.recovering=true;}
}

export function updateBossEncounter(game, dt) {
  if(game.boss?.secret){updateFinalBoss(game,dt);return;}
  const b=game.boss;
  if(!b || b.hp<=0)return;
  b.age+=dt;b.hurt=Math.max(0,b.hurt-dt);b.phaseShield=Math.max(0,(b.phaseShield||0)-dt);
  b.coreOpen=Math.max(0,(b.coreOpen||0)-dt);
  beginBossPhase(game);
  if(b.coreCycle&&!b.coreLock&&b.coreOpen<=0&&b.y>=90)weakpointLock(game);
  // Interaction markers are not attacks: a pulse must never orphan a locked hull.
  if(b.coreLock?.life>0&&!game.hazards.includes(b.coreLock))game.hazards.push(b.coreLock);
  if(!b.charging){
    const targetX=360+Math.sin(b.age*(.35+game.stageId*.025))*(game.stageId===5?90:155);
    let stepX=(targetX-b.x)*Math.min(1,dt*2.2);
    let stepY=(145-b.y)*Math.min(1,dt*1.5);
    // A charge can end near the bottom edge. Bound the unmarked trip home so
    // the large distance does not turn the normal easing into a sudden jump.
    if(b.recovering){
      const distance=Math.hypot(stepX,stepY);
      const scale=distance>0?Math.min(1,BOSS_RECOVERY_SPEED*dt/distance):1;
      stepX*=scale;stepY*=scale;
    }
    b.x+=stepX;b.y+=stepY;
    if(b.y<200)b.recovering=false;
  }
  b.fire-=dt;b.specialTimer-=dt;
  const phase=b.phase; // The shield protects the hull while every attack continues.
  if(b.y<90)return;
  // Ordinary homing shots may coexist with specials; only a live boss special delays the next one.
  if(b.specialTimer<=0 && !game.hazards.some(h=>h.life>0&&!h.enemyProjectile))bossSpecial(game);
  advanceBossCharge(game,dt);
  if(game.hazards.some(h=>h.source===b&&h.quiet&&h.life>0)){b.fire=Math.max(b.fire,.35);return;}
  if(b.fire>0)return;
  if(b.coreLock?.life>0){
    // Keep a gap below the hull. The Architect also sends slow, narrow streams
    // toward untouched nodes, giving the player time to dodge on the approach.
    const architect=(b.patternId||game.stageId)===10&&!b.midboss;
    const count=game.bulletCount(architect?26:18,b,true);
    for(let i=0;i<count;i++){
      const a=i*Math.PI*2/count;
      if(Math.abs(a-Math.PI/2)>.62)game.bossBullet(b.x,b.y,a,120,'gold');
    }
    if(architect)for(const node of b.coreLock.nodes){
      if(node.touched)continue;
      const aim=Math.atan2(node.y-b.y,node.x-b.x);
      game.bossFan(b,aim,3,.26,145);
    }
    b.fire=(architect?1.3:1.8)*sectorTuning(game.stageId).fireInterval;return;
  }
  const id=b.patternId||game.stageId;
  const source=b;
  const aim=Math.atan2(game.player.y-source.y,game.player.x-source.x);
  if(id===1){
    for(const dx of [-65,65])game.bossFan({x:b.x+dx,y:b.y},aim,phase===1?3:4,1.05,155);
    if(b.volley%4===3){const count=game.bulletCount(10,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*.2,110,'gold');}
    b.fire=phase===1?1.2:.95;
  }
  if(id===2){
    game.bossFan(b,Math.PI/2+Math.sin(b.age)*.2,phase===1?11:15,2.1,185,'gold');
    game.bossFan(b,aim,3,.18,235);b.fire=phase===1?.72:.52;
  }
  if(id===3){
    const count=game.bulletCount(phase===1?28:34,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*.4,165,'gold');
    game.bossFan(b,aim,5,.4,250);b.fire=phase===1?.9:.66;
  }
  if(id===4){game.bossFan(source,aim,7,.48,270);game.bossFan(source,Math.PI/2+Math.sin(b.age)*.6,11,1.8,185);b.fire=phase===1?.62:.46;}
  if(id===5){for(const dx of [-90,90])game.bossFan({x:b.x+dx,y:b.y},aim,9,1.15,205,'gold');game.bossFan(b,Math.PI/2,7,1.8,165);b.fire=phase===1?.7:.5;}
  if(id===6){const count=game.bulletCount(phase===1?36:44,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*.5,180,'coral');game.bossFan(b,aim,7,.7,255,'gold');b.fire=phase===1?.66:.48;}
  if(id===7){for(const dx of [-75,75])game.bossFan({x:b.x+dx,y:b.y},aim,9,1.2,210,'gold');if(b.volley%2===0){const count=game.bulletCount(20,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*.3,170);}b.fire=.64-phase*.055;}
  if(id===8){const count=game.bulletCount(28+phase*4,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*(phase===3?-.55:.55),175,'gold');game.bossFan(b,aim,5,.45,280);b.fire=.67-phase*.07;}
  if(id===9){for(const dx of [-80,80])game.bossFan({x:b.x+dx,y:b.y},Math.PI/2+Math.sin(b.age)*.4,13,2,205);game.bossFan(b,aim,7,.6,290);b.fire=.72-phase*.065;}
  if(id===10){const count=game.bulletCount(36+phase*6,b,true);for(let i=0;i<count;i++)game.bossBullet(b.x,b.y,i*Math.PI*2/count+b.age*.65,200);game.bossFan(b,aim,9,.9,300,'gold');b.fire=.62-phase*.05;}
  b.fire=Math.round(b.fire*sectorTuning(game.stageId).fireInterval*20)/20;
  b.volley++;game.emit('enemyShoot');
}

// Round beam ends begin half a width beyond the marked safe hub. Rendering and
// collision use these same segments, so no invisible beam protrudes into the hub.
export function rotorSegments(h){
  return Array.from({length:h.rays||1},(_,i)=>{
    const angle=h.angle+i*Math.PI*2/(h.rays||1),ux=Math.cos(angle),uy=Math.sin(angle),start=h.innerRadius+h.width/2;
    return {x:h.x+ux*start,y:h.y+uy*start,endX:h.x+ux*h.length,endY:h.y+uy*h.length};
  });
}

function inRect(p,rect){return p.x+p.r>rect.x && p.x-p.r<rect.x+rect.w && p.y+p.r>rect.y && p.y-p.r<rect.y+rect.h;}
export function projectHomingOrb(h,player,dt){
 let angle=h.angle,tracking=h.tracking;
 if(h.continuous||tracking>0){
  const desired=Math.atan2(player.y-h.y,player.x-h.x);
  const delta=Math.atan2(Math.sin(desired-angle),Math.cos(desired-angle));
  angle+=clamp(delta,-h.turnRate*dt,h.turnRate*dt);
  if(!h.continuous)tracking=Math.max(0,tracking-dt);
 }
 return {angle,tracking,x:h.x+Math.cos(angle)*h.speed*dt,y:h.y+Math.sin(angle)*h.speed*dt};
}
export function hazardHits(h,p){
  if(h.type==='cross'){
    for(let i=0;i<4;i++){const a=h.angle+i*Math.PI/2,ux=Math.cos(a),uy=Math.sin(a),t=clamp((p.x-h.x)*ux+(p.y-h.y)*uy,0,h.length);if(Math.hypot(p.x-h.x-ux*t,p.y-h.y-uy*t)<p.r+h.width/2)return true;}
    return false;
  }
  if(h.type==='rotor'){
    return rotorSegments(h).some(segment=>{
      const dx=segment.endX-segment.x,dy=segment.endY-segment.y,t=clamp(((p.x-segment.x)*dx+(p.y-segment.y)*dy)/(dx*dx+dy*dy),0,1);
      return Math.hypot(p.x-segment.x-dx*t,p.y-segment.y-dy*t)<p.r+h.width/2;
    });
  }
  if(h.type==='sweepLaser')return inRect(p,{x:h.x-h.width/2,y:h.y,w:h.width,h:h.gapY-h.y})||inRect(p,{x:h.x-h.width/2,y:h.gapY+h.gapHeight,w:h.width,h:h.endY-h.gapY-h.gapHeight});
  if(h.type==='homingOrb')return Math.hypot(p.x-h.x,p.y-h.y)<h.r+p.r;
  if(h.type==='field')return h.rects.some(r=>inRect(p,r));
  if(h.type==='meteor')return Math.hypot(p.x-h.x,p.y-h.y)<h.r+p.r;
  if(h.type==='gate')return inRect(p,{x:0,y:h.y,w:h.gapX,h:h.h})||inRect(p,{x:h.gapX+h.gapWidth,y:h.y,w:720-h.gapX-h.gapWidth,h:h.h});
  return false; // Rail damage follows the moving, visible boss hull.
}

function playerPositionAt(start,end,t){
  if(!start.path)return {x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,r:end.r};
  for(let i=1;i<start.path.length;i++){
    const from=start.path[i-1],to=start.path[i];
    if(t>to.t)continue;
    const part=(t-from.t)/(to.t-from.t);
    return {x:from.x+(to.x-from.x)*part,y:from.y+(to.y-from.y)*part,r:end.r};
  }
  return end;
}

// Preserve clamp and target turns when a threat expires partway through a step.
export function playerMotionUntil(start,end,fraction){
  if(fraction>=1)return {start,end};
  const until=clamp(fraction,0,1);
  const path=start.path||[{t:0,x:start.x,y:start.y},{t:1,x:end.x,y:end.y}];
  const stopped=playerPositionAt(start,end,until);
  const clipped=[{t:0,x:start.x,y:start.y}];
  for(let i=1;i<path.length;i++){
    if(path[i].t>=until)break;
    clipped.push({t:path[i].t/until,x:path[i].x,y:path[i].y});
  }
  clipped.push({t:1,x:stopped.x,y:stopped.y});
  return {start:{x:start.x,y:start.y,r:start.r,path:clipped},end:stopped};
}

// Long rotor arms can cross the cockpit between two clear endpoint angles.
export function rotatingHazardHits(h,p,dt,playerStart=p){
  if(h.type!=='cross'&&h.type!=='rotor')return false;
  const turn=h.rotation*dt;
  if(playerStart.x!==p.x||playerStart.y!==p.y){
    if(hazardHits(h,playerStart)||hazardHits({...h,angle:h.angle+turn},p))return true;
    if(!Number.isFinite(turn))return false;
    const route=playerStart.path||[{x:playerStart.x,y:playerStart.y},{x:p.x,y:p.y}];
    let playerTravel=0,reach=0;
    for(let i=0;i<route.length;i++){
      reach=Math.max(reach,Math.hypot(route[i].x-h.x,route[i].y-h.y));
      if(i)playerTravel+=Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y);
    }
    const beamTravel=Math.min(h.length,reach+p.r+h.width/2)*Math.abs(turn);
    const steps=Math.max(1,Math.ceil((playerTravel+beamTravel)/4));
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const player=playerPositionAt(playerStart,p,t);
      if(hazardHits({...h,angle:h.angle+turn*t},player))return true;
    }
    return false;
  }
  if(hazardHits(h,p)||hazardHits({...h,angle:h.angle+turn},p))return true;
  if(!Number.isFinite(turn)||turn===0)return false;
  const reach=Math.hypot(p.x-h.x,p.y-h.y),thickness=p.r+h.width/2;
  const inner=h.type==='rotor'?h.innerRadius+h.width/2:0;
  if(reach<=inner-thickness||reach>=h.length+thickness)return false;
  const direction=Math.atan2(p.y-h.y,p.x-h.x),count=h.type==='cross'?4:h.rays||1;
  const fullTurn=Math.PI*2,span=Math.abs(turn);
  if(span>=fullTurn)return true;
  for(let i=0;i<count;i++){
    const ray=h.angle+i*fullTurn/count;
    const forward=turn>0?direction-ray:ray-direction;
    const offset=(forward%fullTurn+fullTurn)%fullTurn;
    if(offset<span)return true;
  }
  return false;
}

function movingCircularHazardHits(h,playerStart,playerEnd,startX,startY){
  const route=playerStart.path||[{t:0,x:playerStart.x,y:playerStart.y},{t:1,x:playerEnd.x,y:playerEnd.y}];
  for(let i=1;i<route.length;i++){
    const from=route[i-1],to=route[i];
    const x=startX+(h.x-startX)*from.t-from.x,y=startY+(h.y-startY)*from.t-from.y;
    const dx=(h.x-startX)*(to.t-from.t)-to.x+from.x;
    const dy=(h.y-startY)*(to.t-from.t)-to.y+from.y;
    const length2=dx*dx+dy*dy;
    const at=length2?clamp(-(x*dx+y*dy)/length2,0,1):0;
    if(Math.hypot(x+dx*at,y+dy*at)<h.r+playerEnd.r)return true;
  }
 return false;
}

export function updateHazards(game,dt,playerStart=game.player){
 for(const h of game.hazards){
  if(h.life<=0)continue;
  const launchedMidbossAttack=h.source?.midboss&&Number.isFinite(h.life)&&h.type!=='charge'&&h.type!=='weakpoints';
  if(!h.enemyProjectile&&!launchedMidbossAttack&&(!game.boss || h.source.hp<=0)){h.life=0;continue;}
  if(h.type==='charge')continue; // Already advanced alongside the hull before firing.
  h.age+=dt;
  if(h.delay>0){h.delay=Math.max(0,h.delay-dt);continue;}
  if(h.warning>0){h.warning=Math.max(0,h.warning-dt);continue;}
  if(h.type==='weakpoints'){
   // The warning holds each node in place. Start its orbit only when the
   // warning ends, rather than jumping to an orbit sampled 1.2 seconds in.
   h.motionAge=(h.motionAge||0)+dt;
   const starts=h.nodes.map(node=>({x:node.x,y:node.y}));
   if(h.finale)for(const [i,node] of h.nodes.entries()){
    if(node.touched)continue;
    node.x=node.originX+32*(Math.sin(h.motionAge*.7+i*Math.PI/3)-Math.sin(i*Math.PI/3))*.5;
    node.y=node.originY+26*(Math.sin(h.motionAge*.53+i*Math.PI/2)-Math.sin(i*Math.PI/2))*.5;
   }
   const node=h.nodes.find((node,i)=>!node.touched&&movingCircularHazardHits(
    node,playerStart,game.player,starts[i].x,starts[i].y));
   if(node){
    node.touched=true;game.ring(game.player.x,game.player.y,'#a2cbbd',100,.5);
    game.player.invincible=Math.max(game.player.invincible,h.finale?.65:.75);
    if(h.finale){game.emit('finaleNode');exposeFinalCore(game,h);}
    else if(h.nodes.every(node=>node.touched)){
     h.life=0;h.source.coreLock=null;h.source.coreOpen=CORE_OPEN_DURATION;h.source.specialTimer=2;
     game.banner={title:'Core exposed',sub:'',life:2};game.emit('coreOpen');
    }
   }
   continue;
  }
  const activeDt=Math.min(dt,h.life);
  const motion=activeDt<dt?playerMotionUntil(playerStart,game.player,activeDt/dt):{start:playerStart,end:game.player};
  const initialHit=hazardHits(h,motion.start);
  const rotatingHit=(h.type==='cross'||h.type==='rotor')&&rotatingHazardHits(h,motion.end,activeDt,motion.start);
  const startX=h.x,startY=h.y;
  if(h.type==='meteor'||h.type==='gate')h.y+=h.speed*activeDt;
  if(h.type==='sweepLaser')h.x+=h.vx*activeDt;
  if(h.type==='cross'||h.type==='rotor')h.angle+=h.rotation*activeDt;
  if(h.type==='homingOrb'){
   Object.assign(h,projectHomingOrb(h,motion.end,activeDt));
  }
  const circularHit=(h.type==='meteor'||h.type==='homingOrb')&&movingCircularHazardHits(h,motion.start,motion.end,startX,startY);
  if((initialHit||rotatingHit||circularHit||hazardHits(h,motion.end)) && game.player.invincible<=0){
   // Absorbing a fireball grants no immunity to a simultaneous beam or obstacle.
   if(h.type!=='homingOrb'||!game.absorbShield(game.player.x,game.player.y))
    game.hitPlayer(h.type==='meteor'?30:h.type==='homingOrb'?HOMING_ATTACK_TUNING.damage:24);
   if(h.type==='homingOrb')h.life=0;
  }
  h.life-=dt;
 }
 game.hazards=game.hazards.filter(h=>h.life>0);
}
