import { LEVELS, FORM_KEYS, MAX_RANK, normalizeRank, weaponStats, CONFIG, BOOSTS, BOOST_DROP_CHANCE, PULSE_DROP_CHANCE, HEAL_PICKUP_AMOUNT, healDropChance, RANK_DROP_CHANCE, PULSE_PICKUP_CHARGES, ENEMY_STATS, enemyHealth, sectorTuning, HOMING_ATTACK_TUNING, pickupDropMultiplier, roundHealth } from './balance.js';
export { CONFIG, BOOSTS, BOOST_DROP_CHANCE, PULSE_DROP_CHANCE, HEAL_PICKUP_AMOUNT, HEAL_DROPS_PER_LEVEL, healDropChance, RANK_DROP_CHANCE, PULSE_PICKUP_CHARGES, ENEMY_STATS, enemyHealth } from './balance.js';
import { pace, damageBoss, updateBossEncounter, updateHazards, hazardHits, projectHomingOrb, playerMotionUntil } from './encounters.js';
import { updateFinale, queueFinale } from './finale.js';
import { startBossDestruction, updateBossDestructions, BOSS_VICTORY_HOLD } from './boss-destruction.js';

// Simulation is independent of rendering, input, storage and sound.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const overlaps = (a, b, extra = 0) => distance(a, b) < a.r + b.r + extra;
const pointSegmentDistance = (x,y,endX,endY,pointX,pointY) => {
  const dx=endX-x,dy=endY-y,len2=dx*dx+dy*dy;
  const t=len2?clamp(((pointX-x)*dx+(pointY-y)*dy)/len2,0,1):0;
  return Math.hypot(pointX-x-t*dx,pointY-y-t*dy);
};
const segmentDistance = (x,y,end,p) => pointSegmentDistance(x,y,end.x,end.y,p.x,p.y);
const BOOSTED_LASER_TARGET_LIMIT = 8;
// The boosted beam passes through its targets, rather than merely bending its
// drawn line. Its sampled path is shared by rendering and collision checks.
const boostedLaserPath = (beam, targets, boss) => {
  const ahead=targets.filter(target=>target.y<beam.y-8 &&
    !(target===boss&&(boss.phaseShield>0||boss.coreLock?.life>0)));
  ahead.sort((a,b)=>b.y-a.y || Math.abs(a.x-beam.x)-Math.abs(b.x-beam.x));
  const chosen=ahead.slice(0,BOOSTED_LASER_TARGET_LIMIT);
  if(boss&&ahead.includes(boss)&&!chosen.includes(boss)){
    chosen[chosen.length-1]=boss;
    chosen.sort((a,b)=>b.y-a.y || Math.abs(a.x-beam.x)-Math.abs(b.x-beam.x));
  }
  if(!chosen.length)return null;
  const first=chosen[0],last=chosen.at(-1);
  const knots=[
    {x:beam.x,y:beam.y},
    {x:beam.x,y:Math.max(first.y+8,beam.y-70)},
    ...chosen.map(target=>({x:target.x,y:target.y})),
    {x:last.x,y:Math.min(-80,last.y-120)},
  ];
  const path=[knots[0]];
  for(let i=0;i<knots.length-1;i++){
    const before=knots[Math.max(0,i-1)],from=knots[i],to=knots[i+1],after=knots[Math.min(knots.length-1,i+2)];
    for(let step=1;step<=6;step++){
      const t=step/6,t2=t*t,t3=t2*t;
      path.push({
        x:clamp(.5*((2*from.x)+(-before.x+to.x)*t+(2*before.x-5*from.x+4*to.x-after.x)*t2+(-before.x+3*from.x-3*to.x+after.x)*t3),0,CONFIG.width),
        y:.5*((2*from.y)+(-before.y+to.y)*t+(2*before.y-5*from.y+4*to.y-after.y)*t2+(-before.y+3*from.y-3*to.y+after.y)*t3),
      });
    }
  }
  return {path,first};
};
const segmentSegmentDistance = (ax,ay,bx,by,cx,cy,dx,dy) => {
  const abx=bx-ax,aby=by-ay,cdx=dx-cx,cdy=dy-cy;
  const determinant=abx*cdy-aby*cdx;
  if(determinant!==0){
    const acx=cx-ax,acy=cy-ay;
    const first=(acx*cdy-acy*cdx)/determinant;
    const second=(acx*aby-acy*abx)/determinant;
    if(first>=0&&first<=1&&second>=0&&second<=1)return 0;
  }
  return Math.min(
    pointSegmentDistance(ax,ay,bx,by,cx,cy),pointSegmentDistance(ax,ay,bx,by,dx,dy),
    pointSegmentDistance(cx,cy,dx,dy,ax,ay),pointSegmentDistance(cx,cy,dx,dy,bx,by),
  );
};
const playerSegmentDistance = (start,end,cx,cy,dx,dy) => {
  if(!start.path)return segmentSegmentDistance(start.x,start.y,end.x,end.y,cx,cy,dx,dy);
  let closest=Infinity;
  for(let i=1;i<start.path.length;i++){
    const from=start.path[i-1],to=start.path[i];
    closest=Math.min(closest,segmentSegmentDistance(from.x,from.y,to.x,to.y,cx,cy,dx,dy));
  }
  return closest;
};
const linearMovingDistance = (startX,startY,endX,endY,previous,current) => {
  const x=startX-previous.x,y=startY-previous.y;
  const dx=endX-startX-current.x+previous.x,dy=endY-startY-current.y+previous.y;
  const len2=dx*dx+dy*dy,t=len2?clamp(-(x*dx+y*dy)/len2,0,1):0;
  return Math.hypot(x+t*dx,y+t*dy);
};
const movingDistance = (startX,startY,endX,endY,previous,current) => {
  if(!previous.path)return linearMovingDistance(startX,startY,endX,endY,previous,current);
  let closest=Infinity;
  for(let i=1;i<previous.path.length;i++){
    const from=previous.path[i-1],to=previous.path[i];
    const firstX=startX+(endX-startX)*from.t,firstY=startY+(endY-startY)*from.t;
    const lastX=startX+(endX-startX)*to.t,lastY=startY+(endY-startY)*to.t;
    closest=Math.min(closest,linearMovingDistance(firstX,firstY,lastX,lastY,from,to));
  }
  return closest;
};
const movingCircleContact = (startX,startY,endX,endY,playerStart,playerEnd,radius) => {
  const route=playerStart.path||[{t:0,x:playerStart.x,y:playerStart.y},{t:1,x:playerEnd.x,y:playerEnd.y}];
  for(let i=1;i<route.length;i++){
    const from=route[i-1],to=route[i];
    const firstX=startX+(endX-startX)*from.t,firstY=startY+(endY-startY)*from.t;
    const lastX=startX+(endX-startX)*to.t,lastY=startY+(endY-startY)*to.t;
    const hit=segmentCircleHit(firstX,firstY,lastX-to.x+from.x,lastY-to.y+from.y,from,radius);
    if(hit!==null)return {x:firstX+(lastX-firstX)*hit,y:firstY+(lastY-firstY)*hit};
  }
  return null;
};
const playerPath = (start,end,travelX,travelY,stopAt) => {
  const rawX=start.x+travelX*stopAt,rawY=start.y+travelY*stopAt;
  if(stopAt===1&&rawX>=24&&rawX<=CONFIG.width-24&&rawY>=60&&rawY<=CONFIG.height-32)return null;
  const times=[0,1];
  if(stopAt>0&&stopAt<1)times.push(stopAt);
  for(const [origin,travel,low,high] of [
    [start.x,travelX,24,CONFIG.width-24],[start.y,travelY,60,CONFIG.height-32],
  ]){
    if(travel===0)continue;
    for(const boundary of [low,high]){
      const at=(boundary-origin)/travel;
      if(at>0&&at<stopAt)times.push(at);
    }
  }
  times.sort((a,b)=>a-b);
  return [...new Set(times)].map(t=>t===0?{t,x:start.x,y:start.y}:t===1?{t,x:end.x,y:end.y}:{
    t,x:clamp(start.x+travelX*Math.min(t,stopAt),24,CONFIG.width-24),
    y:clamp(start.y+travelY*Math.min(t,stopAt),60,CONFIG.height-32),
  });
};
// First contact along a projectile's movement, including shots born inside a hull.
const segmentCircleHit = (x, y, endX, endY, target, radius) => {
  const dx=endX-x,dy=endY-y,rx=x-target.x,ry=y-target.y;
  const c=rx*rx+ry*ry-radius*radius;
  if(c<0)return 0;
  const a=dx*dx+dy*dy;
  if(a===0)return null;
  const b=rx*dx+ry*dy,discriminant=b*b-a*c;
  if(discriminant<=0)return null;
  const t=(-b-Math.sqrt(discriminant))/a;
  return t>=0&&t<=1?t:null;
};
const segmentBoxHit = (x, y, endX, endY, centerX, centerY, halfWidth, halfHeight) => {
  let enter=0,leave=1;
  for(const [start,delta,min,max] of [
    [x,endX-x,centerX-halfWidth,centerX+halfWidth],
    [y,endY-y,centerY-halfHeight,centerY+halfHeight],
  ]){
    if(delta===0){if(start<=min||start>=max)return null;continue;}
    const a=(min-start)/delta,b=(max-start)/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>=leave)return null;
  }
  return enter<1&&leave>0?enter:null;
};
// Subtract the target's movement so the sweep compares positions at the same time.
const movingCircleHit = (x,y,endX,endY,target,radius,previous,fraction=1) => previous
  ? segmentCircleHit(x,y,endX-(target.x-previous.x)*fraction,endY-(target.y-previous.y)*fraction,previous,radius)
  : segmentCircleHit(x,y,endX,endY,target,radius);
const movingBoxHit = (x,y,endX,endY,target,previous,fraction=1) => previous
  ? segmentBoxHit(x,y,endX-(target.x-previous.x)*fraction,endY-(target.y-previous.y)*fraction,previous.x,previous.y,86,44)
  : segmentBoxHit(x,y,endX,endY,target.x,target.y,86,44);
const BOSS_BODY_HALF_WIDTH=85,BOSS_BODY_HALF_HEIGHT=48;
const movingBodyBoxHit = (startX,startY,boss,playerStart,playerEnd) => {
  const route=playerStart.path||[{t:0,x:playerStart.x,y:playerStart.y},{t:1,x:playerEnd.x,y:playerEnd.y}];
  for(let i=1;i<route.length;i++){
    const from=route[i-1],to=route[i];
    const firstBossX=startX+(boss.x-startX)*from.t,firstBossY=startY+(boss.y-startY)*from.t;
    const lastBossX=startX+(boss.x-startX)*to.t,lastBossY=startY+(boss.y-startY)*to.t;
    if(segmentBoxHit(from.x-firstBossX,from.y-firstBossY,to.x-lastBossX,to.y-lastBossY,0,0,BOSS_BODY_HALF_WIDTH,BOSS_BODY_HALF_HEIGHT)!==null)return true;
  }
  return false;
};
const targetInPlayAt = (target,position) => !!target && !!position && !target.dead && target.hp > 0
  && position.y > -35 && position.y < CONFIG.height + 20
  && position.x > -target.r && position.x < CONFIG.width + target.r;
const targetInPlay = target => targetInPlayAt(target,target);
// Midboss beams already in flight outlive their emitter.
const laserSourceGone = laser => !laser.source?.midboss && (laser.source?.dead || laser.source?.hp <= 0);
const normalizeAmmo = (v, fallback, min, max) => Number.isFinite(Number(v)) ? clamp(Math.floor(Number(v)), min, max) : fallback;
// Imported extreme ranks retain their full volley damage without allocating thousands of objects.
export const MAX_VOLLEY_PROJECTILES=64;
export const MAX_PARTICLES=800;
const projectileGroups=count=>Array.from({length:Math.min(count,MAX_VOLLEY_PROJECTILES)},(_,i)=>{
  const physical=Math.min(count,MAX_VOLLEY_PROJECTILES),first=Math.floor(i*count/physical),end=Math.floor((i+1)*count/physical);
  return {index:(first+end-1)/2,multiplicity:end-first};
});
let runSequence = 0;
let runIdSequence = 0;

export function createRunId() {
  let nonce;
  let provider;
  try { provider=globalThis.crypto; } catch { /* Fall back if access is restricted. */ }
  try {
    if(typeof provider?.randomUUID==='function')nonce=provider.randomUUID();
  }catch{ /* Try the basic crypto API next. */ }
  if(!nonce){
    try {
      if(typeof provider?.getRandomValues==='function'){
        const bytes=new Uint8Array(16);
        provider.getRandomValues(bytes);
        nonce=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
      }
    }catch{ /* Keep local play usable if the platform's crypto provider fails. */ }
  }
  // Secure randomness is available in normal browsers; this also works in a
  // restricted preview without touching the game's seeded random source.
  nonce??=`${globalThis.performance?.timeOrigin??Date.now()}-${globalThis.performance?.now?.()??0}-${Math.random()}`;
  return `${Date.now()}-${++runIdSequence}-${nonce}`;
}

export class Game {
  constructor(random = Math.random) { this.random = random; this.reset(); this.state = 'ready'; }

  reset(options = {}) {
    const { stageId = 1 } = options;
    this.stage = LEVELS.find(level => level.id === Number(stageId)) || LEVELS[0];
    this.stageId = this.stage.id;
    this.duration = this.stage.duration;
    this.runId = createRunId();
    const sequence=++runSequence;
    // Particle variation must not consume rolls used for loot or encounter choices.
    this.effectState = (0x9e3779b9 ^ sequence) >>> 0;
    this.rank = normalizeRank(options.rank);
    this.form = FORM_KEYS.includes(options.form) ? options.form : FORM_KEYS[0]; this.transform = null;
    this.routeTime=0;this.spawnedMidbosses=new Set();this.clearedMidbosses=new Set();this.spawnedElites=new Set();this.eliteRelief=0;this.routeBlocked=false;this.lootKills=0;
    this.systems = {
      missiles:{cooldown:0,active:0},laser:{cooldown:0,active:0},
      shield:{cooldown:0,active:0,charges:0,radius:this.stats('shield').radius},
    };
    this.state = 'playing'; this.time = 0; this.approachComplete = false; this.bossDefeated=false; this.clearTime=0;
    this.kills = 0; this.pulses = normalizeAmmo(options.pulses,CONFIG.pulses,0,CONFIG.maxPulses);this.boosts={invincible:0,damage:0,homing:0};
    this.player = { x: 360, y: 755, r: CONFIG.hitRadius, hp: CONFIG.maxHp, maxHp: CONFIG.maxHp, invincible: 1.8, shotTimer: 0, focus: false, roll: 0 };
    this.enemies = []; this.bullets = []; this.shots = []; this.missiles = []; this.beam = null; this.hostileLasers = []; this.hazards = [];
    this.pickups = []; this.particles = []; this.rings = []; this.bossDestructions = []; this.events = []; this.boss = null;
    this.spawnTimer = 2; this.spawnCount = 0; this.encountered = new Set(); this.shake = 0; this.flash = 0;
    this.banner = { title: `${String(this.stageId).padStart(2, '0')} / ${this.stage.name.toUpperCase()}`, sub: '', life: 3.2 };
    this.rankCollected=0;this.finale=null;

    this.emit('start');
  }

  get damageMultiplier(){return this.boosts.damage>0?3:1;}
  activateBoost(key,duration=BOOSTS[key]?.duration){
    if(!Object.hasOwn(BOOSTS,key)||!Number.isFinite(duration)||duration<=0)return;
    this.boosts[key]=Math.max(this.boosts[key],duration);
    if(key==='invincible')this.player.invincible=Math.max(this.player.invincible,this.boosts[key]);
  }
  stats(key) {
    return weaponStats(key,this.rank);
  }

  requestForm(key) {
    if(this.finale?.ultimate || !FORM_KEYS.includes(key) || key===this.form || this.transform || !['ready','playing'].includes(this.state))return false;
    // Transformation changes only the weapon and silhouette, never combat timers.
    this.beam=null;
    if(this.state==='ready'){
      this.form=key;this.emit('transform',{form:key});
    }else this.transform={target:key,remaining:CONFIG.transformDelay,duration:CONFIG.transformDelay};
    return true;
  }

  updateTransform(dt) {
    if(!this.transform)return;
    this.transform.remaining=Math.max(0,this.transform.remaining-dt);
    if(this.transform.remaining<=1e-8){
      this.form=this.transform.target;this.transform=null;this.emit('transform',{form:this.form});
    }
  }

  syncSystems(){
    for(const key of ['missiles','laser','shield']){
      const s=this.stats(key),system=this.systems[key];
      system.cooldown=Math.min(system.cooldown,s.cooldown||0);
    }
  }
  get pacing() {
    const base=pace(this.stageId,Math.min(this.routeTime,this.duration),this.duration);
    return {...base,relief:this.eliteRelief>0,interval:this.eliteRelief>0?Math.max(base.interval,3.8/sectorTuning(this.stageId).normalDensity):base.interval};
  }
  get nextMidboss(){return this.stage.midbosses.find(boss=>!this.spawnedMidbosses.has(boss.id))||null;}
  get nextEncounterTime(){
    const times=this.stage.elites.filter(e=>!this.spawnedElites.has(e.id)).map(e=>e.at*this.duration);
    if(this.nextMidboss)times.push(this.duration*this.nextMidboss.at);
    return Math.min(this.duration,...times);
  }
  get progress() {
    if(this.state==='victory')return 1;
    if(this.finale){
      if(this.finale.completed)return .999;
      if(!this.boss?.secret)return .995;
      return .995+.004*clamp(1-this.boss.hp/this.boss.maxHp,0,1);
    }
    return this.approachComplete
      ? Math.min(.995,.8+.2*(1-(this.boss?.hp||0)/(this.boss?.maxHp||1)))
      : Math.min(.8,this.routeTime/this.duration*.8);
  }
  emit(name, data = {}) { this.events.push({ name, ...data }); }
  pause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
  effectRandom() {
    this.effectState = (Math.imul(this.effectState, 1664525) + 1013904223) >>> 0;
    return this.effectState / 0x100000000;
  }
  effect(x, y, color, count = 16, strength = 1) {
    for (let i = 0; i < count; i++) {
      const a = this.effectRandom() * Math.PI * 2, speed = (35 + this.effectRandom() * 180) * strength, life = 0.25 + this.effectRandom() * 0.55;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, size: 1.5 + this.effectRandom() * 3, color });
    }
    // Dense volleys may create thousands of decorative sparks in one frame.
    // Keep the newest impacts visible without growing the draw list indefinitely.
    if(this.particles.length>MAX_PARTICLES)this.particles.splice(0,this.particles.length-MAX_PARTICLES);
  }
  ring(x, y, color, max = 110, life = 0.45) { this.rings.push({ x, y, color, max, life, maxLife: life }); }
  bullet(x, y, angle, speed, color = 'coral', r = 6) {
    const stageSpeed = this.pacing.speed * CONFIG.enemyBulletSpeed;
    this.bullets.push({ x, y, vx: Math.cos(angle) * speed * stageSpeed, vy: Math.sin(angle) * speed * stageSpeed, r, color, damage: this.stageId === 1 ? 8 : this.stageId === 2 && this.time < 30 ? 10 : CONFIG.bulletDamage, dead: false });
  }
  bulletCount(count,source=this,boss=false){
    const inBoss=boss||this.boss?.hp>0,owner=inBoss?(this.boss||this):source,key=inBoss?'boss':'normal';
    owner.bulletRemainders??={normal:.5,boss:.5};
    const budget=count*(inBoss?.5:.75)+owner.bulletRemainders[key],shots=Math.floor(budget+1e-9);
    owner.bulletRemainders[key]=Math.max(0,budget-shots);return shots;
  }
  fan(source, angle, count, spread, speed, color = 'coral', boss = false) {
    const shots=this.bulletCount(count,source,boss);
    for(let i=0;i<shots;i++)this.bullet(source.x,source.y+20,angle+(shots===1?0:(i/(shots-1)-.5)*spread),speed,color);
  }
  bossBullet(x, y, angle, speed, color = 'coral', r = 6) {
    return this.bullet(x,y,angle,speed*CONFIG.bossBulletSpeed,color,r);
  }
  bossFan(source, angle, count, spread, speed, color = 'coral') {
    return this.fan(source,angle,count,spread,speed*CONFIG.bossBulletSpeed,color,true);
  }
  hostileLaser(source, angle, options = {}) {
    const laser = { x: source.x, y: source.y + 20, angle, length: 1200, width: 16, warning: 1.15, life: 0.9, maxLife: 0.9, source, ...options };
    laser.warning*=sectorTuning(this.stageId).warning;
    this.hostileLasers.push(laser);
    return laser;
  }

  spawn(type, x, y = -60, options = {}) {
    const stats = ENEMY_STATS[type];
    if (!stats) return null;
    const hp = enemyHealth(type, this.stageId);
    const cooldown = stats.cooldown * (stats.elite || type === 'lancer' ? sectorTuning(this.stageId).fireInterval : this.pacing.fire);
    const enemy = { type, x, y, originX: x, age: 0, ...stats, lootEligible:true, speed: stats.speed * (this.stageId === 1 ? .8 : 1), hp, maxHp: hp, cooldown, fire: (type==='sniper'?.15:Math.min(.65,cooldown*.32)), hurt: 0, windup: 0, aimAngle: Math.PI / 2, ...options };
    this.enemies.push(enemy);
    if (!this.encountered.has(type)) {
      this.encountered.add(type);
      if ((this.stage.introduce || []).includes(type)) this.banner = { title: stats.title, sub: '', life: 3.8 };
    }
    return enemy;
  }

  formation() {
    const n=this.spawnCount++, pacing=this.pacing;
    let available=this.stage.formationEnemies||this.stage.enemyTypes;
    if(this.stageId===1 && this.time<18)available=['scout'];
    if(this.stageId===2 && this.time<15)available=['scout','dart'];
    const introductions=this.stage.introduce||[];
    const type = this.stageId>2 && n<introductions.length ? introductions[n] : available[n%available.length];
    const light=['scout','dart'].includes(type);
    const usualCount=pacing.lull?2:light ? pacing.intensity<.4?3:pacing.intensity<.8?4:6 : ['bomber','bulwark','lancer','pursuer'].includes(type)?2:3;
    const count=pacing.relief?Math.min(usualCount,light?2:1):usualCount;
    for(let i=0;i<count;i++){
      const x=count===1?180+(n%3)*180:120+i*480/(count-1);
      this.spawn(type,x,-60-Math.abs(i-(count-1)/2)*36,{drift:n%2?-20:20});
    }
    this.spawnTimer=pacing.interval;
  }

  startBoss(midboss=false) {
    const encounter=midboss?this.nextMidboss:null;
    if(this.boss||this.approachComplete||midboss&&!encounter)return;
    // A pulse can defeat an elite between frames; award its cargo before the transition.
    for(const e of [...this.enemies])if(!e.dead&&e.hp<=0)this.killEnemy(e);
    if(midboss)this.spawnedMidbosses.add(encounter.id);else this.approachComplete=true;
    // Arrival never erases attacks or their living emitters.
    this.enemies=this.enemies.filter(e=>!e.dead&&e.hp>0);
    this.player.invincible=Math.max(this.player.invincible,2);
    this.boss={name:midboss?encounter.name:this.stage.bossName,midboss,midbossId:encounter?.id,patternId:midboss?encounter.pattern:this.stageId,phaseCount:midboss?2:this.stage.phases||2,x:360,y:-150,r:76,hp:midboss?encounter.health:this.stage.bossHealth,maxHp:midboss?encounter.health:this.stage.bossHealth,age:0,fire:1.1,specialTimer:4,specialCount:0,hurt:0,phase:1,phaseShield:0,volley:0,charging:false};
    this.banner={title:this.boss.name,sub:midboss?'Mid-boss':'Boss',life:3};this.emit('boss');
  }

  firePlayer() {
    if(this.state!=='playing'||(this.form!=='primary'&&!this.finale?.ultimate)||this.transform||this.player.shotTimer>0)return false;
    const p = this.player, stats = this.stats('primary');
    for (const {index,multiplicity} of projectileGroups(stats.shotCount)) {
      const position=stats.shotCount===1?0:index/(stats.shotCount-1)*2-1;
      const halfAngle=stats.spread*(stats.shotCount-1)/2;
      // Equal slopes and evenly spaced muzzles keep each cross-section of a large fan uniform.
      const angle=Math.atan(position*Math.tan(halfAngle)),muzzle=position*Math.min(28,(stats.shotCount-1)*2.5);
      this.shots.push({ x: clamp(p.x+muzzle,8,CONFIG.width-8), y: p.y - 24, vx: Math.sin(angle) * CONFIG.bulletSpeed, vy: -Math.cos(angle) * CONFIG.bulletSpeed, r: 5, damage: stats.damage*multiplicity, multiplicity, life:3, homing:this.boosts.homing>0, target:null, dead: false });
    }
    p.shotTimer = stats.interval-(p.shotCarry||0);p.shotCarry=0;this.emit('shoot');return true;
  }

  activateSystem(key) {
    const system = this.systems[key];
    if(FORM_KEYS.includes(key)&&(this.transform||this.form!==key&&!this.finale?.ultimate))return false;
    if(key==='laser'&&this.beam)return false;
    if (this.state !== 'playing' || !system || system.cooldown > 0 || system.active > 0) return false;
    const stats = this.stats(key), p = this.player;
    system.cooldown = (stats.cooldown||0)-(key==='missiles'?(system.cooldownCarry||0):0);system.cooldownCarry=0;
    if (key === 'missiles') {
      const targets=this.targets();
      for (const {index,multiplicity} of projectileGroups(stats.count)) {
        const offset=index-(stats.count-1)/2,angle=-Math.PI/2+offset*Math.min(.2,1/(stats.count-1));
        this.missiles.push({ x: clamp(p.x+clamp(offset*17,-38,38),8,CONFIG.width-8), y: p.y - 15, vx: Math.cos(angle) * stats.speed, vy: Math.sin(angle) * stats.speed, angle, speed: stats.speed, r: 7, damage: stats.damage*multiplicity, multiplicity, blast: stats.radius, life: 5, dead: false, target: this.randomTarget(targets) });
      }
      system.active = 0.18;
    } else if (key === 'laser') {
      system.active = .1;
      this.beam = {x:p.x,y:p.y-22,angle:-Math.PI/2,length:1200,width:stats.width,damagePerSecond:stats.damagePerSecond};
    } else if (key === 'shield') {
      system.active = stats.duration; system.charges = stats.charges;
      this.ring(p.x, p.y, '#adc9bf', 65, 0.4);
    }
    this.emit(key); return true;
  }

  usePulse() {
    if (this.state !== 'playing' || this.pulses <= 0) return false;
    this.pulses--;
    for (const b of this.bullets) this.effect(b.x, b.y, '#adc9bf', 2, 0.3);
    this.bullets.length = 0; this.hostileLasers.length = 0; this.hazards = this.hazards.filter(h=>h.type==='weakpoints');
    if (this.boss) { if(this.boss.charging)this.boss.recovering=true;this.boss.charging = false; }
    this.ring(this.player.x, this.player.y, '#adc9bf', 1150, 0.85); this.player.invincible = Math.max(1.5, this.player.invincible);
    const stats=this.stats('pulse');
    const multiplier=this.damageMultiplier;
    for(const e of this.enemies){e.hp-=stats.damage*multiplier;e.hurt=.16;}
    if(this.boss)this.damageTarget(this.boss,stats.damage*multiplier,.2);
    this.shake = 0.25; this.flash = 0.16; this.emit('pulse'); return true;
  }

  hitPlayer(damage = CONFIG.bulletDamage) {
    const p = this.player;
    if (p.invincible > 0 || this.state !== 'playing') return;
    p.hp = Math.max(0, p.hp - damage); p.invincible = CONFIG.hitGrace; this.shake = 0.25; this.flash = 0.18;
    this.effect(p.x, p.y, '#bd7770', 16, 0.8); this.ring(p.x, p.y, '#bd7770', 80, 0.35);
    // Mark in place so iteration never processes a replacement array twice.
    for (const b of this.bullets) if (distance(b, p) <= 80) b.dead = true;
    this.emit('playerHit');
    if (p.hp <= 0) { if(this.finale)this.finale.ultimate=false;this.beam=null;this.systems.laser.active=0;this.state = 'gameover'; this.emit('lose'); }
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true; this.kills++;
    this.effect(e.x, e.y, e.type === 'weaver' ? '#a6a5ba' : '#c5a58d', e.r >= 28 ? 26 : 14); this.ring(e.x, e.y, '#c5a58d', e.r * 2, 0.28); this.emit('explode');
    if (e.type === 'splitter') for (const side of [-1, 1]) this.spawn('dart', clamp(e.x + side * 26, 25, 695), e.y, { drift: side * 90, fire: 10,lootEligible:e.lootEligible });
    // Summoned escorts never award loot or prime the next genuine kill's reward.
    if(e.lootEligible===false)return;
    if(!e.elite)this.lootKills++;
    const dropMultiplier=pickupDropMultiplier(this.stageId);
    if(e.elite||this.random()<RANK_DROP_CHANCE*dropMultiplier)this.dropRank(e.x,e.y);
    if(!e.elite&&this.random()<BOOST_DROP_CHANCE*dropMultiplier)this.dropBoost(e.x,e.y);
    if(this.pulses<CONFIG.maxPulses&&this.random()<PULSE_DROP_CHANCE*dropMultiplier)this.pickups.push({x:e.x,y:e.y,r:19,age:0,type:'pulse'});
    if(!e.elite&&this.player.hp<this.player.maxHp&&this.random()<healDropChance(this.stageId))this.pickups.push({x:e.x,y:e.y,r:20,age:0,type:'heal'});
  }

  dropBoost(x,y){
    const types=Object.keys(BOOSTS),boost=types[Math.min(types.length-1,Math.floor(this.random()*types.length))];
    this.pickups.push({x,y,r:21,age:0,type:'boost',boost});
  }

  dropRank(x,y,amount=1) {
    const pending=this.pickups.filter(p=>!p.dead&&p.type==='rank').reduce((sum,p)=>sum+normalizeRank(p.amount),0);
    const gained=Math.min(normalizeRank(amount),MAX_RANK-this.rank-pending);
    if(gained<=0)return;
    this.pickups.push({x:clamp(x,28,692),y,r:20,age:0,type:'rank',amount:gained});
  }

  collectPickup(item) {
    if(!item||item.dead||this.state!=='playing')return;
    item.dead=true;
    if(item.type==='boost'){
      if(!Object.hasOwn(BOOSTS,item.boost))return;
      this.activateBoost(item.boost);this.banner={title:BOOSTS[item.boost].label,sub:Math.round(this.boosts[item.boost])+' seconds',life:2};
      this.ring(this.player.x,this.player.y,'#dbe8d9',80,.4);this.emit('pickup',{temporary:true});return;
    }
    if(item.type==='pulse'){this.pulses=Math.min(CONFIG.maxPulses,this.pulses+PULSE_PICKUP_CHARGES);this.ring(this.player.x,this.player.y,'#dbe8d9',65,.3);this.emit('pickup');return;}
    if(item.type==='heal'){const before=this.player.hp;this.player.hp=Math.min(this.player.maxHp,this.player.hp+HEAL_PICKUP_AMOUNT);this.ring(this.player.x,this.player.y,'#ddc6a4',70,.4);this.emit('pickup',{heal:this.player.hp-before});return;}
    if(item.type!=='rank')return;
    const next=normalizeRank(this.rank+normalizeRank(item.amount));
    this.rankCollected+=next-this.rank;this.rank=next;
    this.syncSystems();
    this.ring(this.player.x,this.player.y,'#9abfaf',65,.3);this.emit('pickup');
  }

  updatePickups(dt) {
    const p=this.player;
    for(const item of this.pickups){
      if(item.dead)continue;
      item.age+=dt;item.y+=95*dt;
      // Every pickup keeps drifting; the same nearby magnet can catch it before it leaves.
      if(distance(item,p)<160){const a=angleTo(item,p);item.x+=Math.cos(a)*310*dt;item.y+=Math.sin(a)*310*dt;}
      if(overlaps(item,p,18))this.collectPickup(item);
      else if(item.y>950)item.dead=true;
      if(this.state!=='playing')break;
    }
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead || e.hp <= 0) continue;
      e.age += dt; e.charging = Math.max(0, (e.charging || 0) - dt); e.hurt = Math.max(0, e.hurt - dt);
      if(e.elite){
        const stationY=e.type==='ace'?230:e.type==='siege'?170:270;
        const travel=500*dt;
        e.y+=clamp((stationY-e.y)*Math.min(1,dt*1.5),-travel,travel);
        const stationX=clamp(e.originX+Math.sin(e.age*(e.type==='ace'?(e.intro?.75:1.1):.45))*(e.type==='ace'?(e.intro?100:155):75),65,655);
        // A malformed edge spawn should approach its lane rather than snap to it.
        e.x+=clamp(stationX-e.x,-travel,travel);
      }else if(e.type!=='sniper'||!(e.windup>0||e.stream>0))e.y += e.speed * dt * (e.charging > 0 ? 0.08 : 1)*(this.eliteRelief>0?.8:1);
      if (e.type === 'scout') e.x = e.originX + Math.sin(e.age * 1.7) * 34;
      if (e.type === 'weaver'||e.type==='seeker') e.x = e.originX + Math.sin(e.age * 1.3) * 100;
      if (e.type === 'interceptor') e.x = e.originX + Math.sin(e.age * 2.3) * 105;
      if (e.type === 'dart') e.x += (e.drift || 0) * dt;
      e.fire -= dt;
      const inRange = e.y > 10 && e.y < 625;
      if(e.type==='sniper'){
        if(e.y>CONFIG.height+70){e.dead=true;continue;}
        if(e.windup>0){
          e.windup=Math.max(0,e.windup-dt);
          if(e.windup===0){e.stream=2.4;e.streamShot=0;}
        }else if(e.stream>0){
          e.stream=Math.max(0,e.stream-dt);e.streamShot-=dt;
          if(e.streamShot<=0){this.fan(e,e.aimAngle,3,.075,530,'coral');e.streamShot+=.08*sectorTuning(this.stageId).fireInterval;this.emit('enemyShoot');}
          if(e.stream===0)e.fire=.35*sectorTuning(this.stageId).fireInterval;
        }else if(e.fire<=0&&inRange){e.aimAngle=angleTo(e,this.player);e.windup=.65*sectorTuning(this.stageId).warning;}
        continue;
      }
      if (e.fire <= 0 && inRange) {
        const angle = angleTo(e, this.player);
        if (e.type === 'scout') this.fan(e, angle, this.pacing.intensity<.6?1:3, .38, 155);
        if (e.type === 'turret') this.fan(e, angle, 5, 0.65, 170, 'gold');
        if (e.type === 'weaver') this.fan(e, Math.PI / 2, 7, 1.5, 155, 'violet');
        if (e.type === 'mine' || e.type === 'bomber') {
          const count=this.bulletCount(e.type==='mine'?10:14,e);
          for (let i = 0; i < count; i++) this.bullet(e.x, e.y, i * Math.PI * 2 / count + e.age * 0.25, e.type === 'mine' ? 135 : 125, 'gold');
          this.ring(e.x, e.y, '#c7b28c', 100, 0.4);
        }
        if (e.type === 'interceptor') this.fan(e, angle, 3, 0.25, 210);
        if (e.type === 'splitter') this.fan(e, angle, 2, 0.28, 180, 'violet');
        if (e.type === 'bulwark') this.fan(e, Math.PI / 2, 5, 1, 150, 'gold');
        if (e.type === 'lancer') { this.hostileLaser(e, angle); e.charging = 2.05; }
        if(e.type==='ace'){this.fan(e,angle,5,.45,270,'coral');e.burst=(e.burst||0)+1;}
        if(e.type==='siege'){for(const dx of [-75,75])this.hostileLaser(e,Math.PI/2,{x:e.x+dx,warning:1.5,width:24});e.charging=2.5;}
        if(e.type==='bastion'){if(this.stageId!==9){const count=this.bulletCount(14,e);for(let i=0;i<count;i++)this.bullet(e.x,e.y,i*Math.PI*2/count+e.age*.2,120,'gold');}this.fan(e,angle,5,.65,170);}
        if(e.type==='seeker'||e.type==='pursuer')this.enemyHoming(e,e.type==='pursuer'?2:1,e.type==='seeker');
        if(this.stageId>=7&&(e.type==='lancer'||e.type==='bastion')){
          e.homingVolley=(e.homingVolley||0)+1;
          if(e.homingVolley%3===0||this.stageId===9)this.enemyHoming(e,1,true);
        }
        e.fire = e.type==='ace' && e.burst%3 ? .28*sectorTuning(this.stageId).fireInterval : e.cooldown * (this.pacing.lull ? 1.7 : 1);
        if (e.type !== 'dart' && e.type !== 'sniper') this.emit('enemyShoot');
      }
      if (!e.elite && (e.y > CONFIG.height + 70 || e.x < -100 || e.x > CONFIG.width + 100)) e.dead = true;
    }
  }

  enemyHoming(source,count=1,continuous=true){
    const cap=this.stageId===9?6:2,used=this.hazards.filter(h=>h.enemyProjectile&&h.type==='homingOrb'&&h.life>0).length;
    for(let i=0;i<Math.min(count,cap-used);i++){
      const x=source.x+(count===1?0:(i-(count-1)/2)*36),y=source.y+20;
      this.hazards.push({type:'homingOrb',enemyProjectile:true,continuous,color:continuous?'purple':'coral',x,y,r:count>1?15:12,
        angle:Math.atan2(this.player.y-y,this.player.x-x),speed:105*HOMING_ATTACK_TUNING.speed,
        turnRate:(this.stageId===9?.30:.27)*HOMING_ATTACK_TUNING.turnRate,tracking:continuous?Infinity:3.6,
        warning:(this.stageId===9?.9:1.1)*sectorTuning(this.stageId).warning,life:7,delay:i*.18,age:0,source,blockedUntil:0});
    }
  }

  updateBoss(dt) { updateBossEncounter(this,dt); }

  damageTarget(target,damage,hurt=.1) {
    if(target===this.boss)return damageBoss(this,damage,hurt);
    if(!target || target.dead || target.hp<=0 || !(damage>0))return 0;
    target.hp-=damage;target.hurt=hurt;return damage;
  }

  explodeMissile(missile, targets=this.targets(), motion=null, contact=1) {
    if(missile.dead)return;
    missile.dead=true;this.effect(missile.x,missile.y,'#adc9bf',22,.9);this.ring(missile.x,missile.y,'#adc9bf',missile.blast,.3);
    for(const e of targets){
      if(e.dead||e.hp<=0)continue;
      const previous=motion?.get(e);
      const x=previous?previous.x+(e.x-previous.x)*contact:e.x;
      const y=previous?previous.y+(e.y-previous.y)*contact:e.y;
      if(Math.hypot(missile.x-x,missile.y-y)<missile.blast+e.r)this.damageTarget(e,missile.damage*this.damageMultiplier,.13);
    }
    this.emit('hit');
  }

  targetable(target) {
    return targetInPlay(target) && (target === this.boss || this.enemies.includes(target));
  }

  targets() {
    const targets=this.enemies.filter(targetInPlay);
    if(targetInPlay(this.boss))targets.push(this.boss);
    return targets;
  }

  randomTarget(candidates=this.targets()) {
    const available=candidates.filter(targetInPlay);
    return available.length ? available[Math.min(available.length - 1, Math.floor(this.random() * available.length))] : null;
  }

  autoSystems(dt=0,playerStart=this.player) {
    const p = this.player, targets = this.targets(),ultimate=this.finale?.ultimate===true;
    if(ultimate&&!this.transform&&p.shotTimer<=0)this.firePlayer();
    if(!this.transform&&(ultimate||this.form==='missiles')&&targets.length)this.activateSystem('missiles');
    if(!this.transform&&(ultimate||this.form==='laser')){
      if(!this.beam)this.activateSystem('laser');
      this.systems.laser.active=.1;
    }else this.beam=null;
    const approaching = this.bullets.some(b => {
      if (b.dead) return false;
      const speed2 = b.vx * b.vx + b.vy * b.vy;
      const time = speed2 ? clamp(((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / speed2, 0, 0.6) : 0;
      return Math.hypot(b.x + b.vx * time - p.x, b.y + b.vy * time - p.y) < 57 + b.r;
    });
    // Only fireballs are absorbable hazards; beams and large obstacles bypass shields.
    const orbThreat=this.hazards.some(h=>{
      if(h.type!=='homingOrb'||h.life<=0||h.delay>0||h.warning>=.3)return false;
      const activeDt=Math.min(dt,h.life);
      const motion=activeDt<dt?playerMotionUntil(playerStart,p,activeDt/dt):{start:playerStart,end:p};
      if(hazardHits(h,motion.start))return true;
      if(h.warning>0||activeDt<=0)return hazardHits(h,motion.end);
      const next=projectHomingOrb(h,motion.end,activeDt);
      return movingDistance(h.x,h.y,next.x,next.y,motion.start,motion.end)<h.r+p.r;
    });
    if (p.invincible <= 0 && (approaching || orbThreat)) this.activateSystem('shield');
  }

  updateWeapons(dt, motion=null, movingShots=0, movingMissiles=0) {
    const boss = this.boss;
    for (let i=0;i<this.shots.length;i++) {
      const s=this.shots[i],origins=i<movingShots?motion:null;
      if (s.dead) continue;
      if(s.life!==undefined&&(!Number.isFinite(s.life)||s.life<=0)){s.dead=true;continue;}
      const activeDt=s.life===undefined?dt:Math.min(dt,s.life);
      const liveFraction=dt>0?activeDt/dt:1;
      if(s.life!==undefined)s.life-=dt;
      if(s.homing&&this.boosts.homing>0){
        if(!this.targetable(s.target))s.target=this.randomTarget();
        if(s.target){
          const previous=origins?.get(s.target);
          const aim=previous?{x:previous.x+(s.target.x-previous.x)*liveFraction,y:previous.y+(s.target.y-previous.y)*liveFraction}:s.target;
          let angle=Math.atan2(s.vy,s.vx);const desired=angleTo(s,aim),delta=Math.atan2(Math.sin(desired-angle),Math.cos(desired-angle));
          angle+=clamp(delta,-7*activeDt,7*activeDt);s.vx=Math.cos(angle)*CONFIG.bulletSpeed;s.vy=Math.sin(angle)*CONFIG.bulletSpeed;
        }
      }
      const oldX=s.x,oldY=s.y;
      s.x += s.vx * activeDt; s.y += s.vy * activeDt;
      let first=null,hitAt=Infinity;
      for (const e of this.enemies) {
        if (e.dead || e.hp <= 0) continue;
        const t=movingCircleHit(oldX,oldY,s.x,s.y,e,s.r+e.r,origins?.get(e),liveFraction);
        if(t!==null&&t<hitAt){first=e;hitAt=t;}
      }
      if(boss&&boss.hp>0){
        const t=movingBoxHit(oldX,oldY,s.x,s.y,boss,origins?.get(boss),liveFraction);
        if(t!==null&&t<hitAt){first=boss;hitAt=t;}
      }
      if(first){
        const x=oldX+(s.x-oldX)*hitAt,y=oldY+(s.y-oldY)*hitAt;
        const previous=origins?.get(first);
        const centerY=previous?previous.y+(first.y-previous.y)*hitAt*liveFraction:first.y;
        const armor=first!==boss&&first.type==='bulwark'&&y>=centerY?0.35:1;
        this.damageTarget(first,s.damage*armor*this.damageMultiplier,first===boss ? .065 : .075);s.dead=true;
        this.effect(x,y,armor<1?'#a7b1d1':'#fff1cf',2,.3);
      }
      if(!s.dead&&(s.life<=0||s.y<-30||s.y>CONFIG.height+30||s.x<-30||s.x>CONFIG.width+30))s.dead=true;
    }
    const targets=this.missiles.length?this.targets():[];
    let sweptTargets=targets;
    if(motion&&movingMissiles){
      sweptTargets=this.enemies.filter(e=>targetInPlay(e)||targetInPlayAt(e,motion.get(e)));
      if(targetInPlay(this.boss)||targetInPlayAt(this.boss,motion.get(this.boss)))sweptTargets.push(this.boss);
    }
    const targetSet=new Set(targets),sweptTargetSet=sweptTargets===targets?targetSet:new Set(sweptTargets);
    for (let i=0;i<this.missiles.length;i++) {
      const missile=this.missiles[i],origins=i<movingMissiles?motion:null;
      if (missile.dead) continue;
      if(!Number.isFinite(missile.life)||missile.life<=0){missile.dead=true;continue;}
      const activeDt=Math.min(dt,missile.life),liveFraction=dt>0?activeDt/dt:1;
      missile.life -= dt;
      const collisionTargets=origins?sweptTargets:targets;
      const candidateSet=origins?sweptTargetSet:targetSet;
      if (!missile.target || !candidateSet.has(missile.target) || missile.target.dead || missile.target.hp<=0) missile.target = this.randomTarget(targets);
      const target = missile.target;
      if (target) {
        const previous=origins?.get(target);
        const aim=previous?{x:previous.x+(target.x-previous.x)*liveFraction,y:previous.y+(target.y-previous.y)*liveFraction}:target;
        const desired = angleTo(missile, aim), delta = Math.atan2(Math.sin(desired - missile.angle), Math.cos(desired - missile.angle));
        missile.angle += clamp(delta, -5.5 * activeDt, 5.5 * activeDt);
      }
      missile.vx = Math.cos(missile.angle) * missile.speed; missile.vy = Math.sin(missile.angle) * missile.speed;
      const oldX=missile.x,oldY=missile.y;
      missile.x += missile.vx * activeDt; missile.y += missile.vy * activeDt;
      let hitAt=Infinity;
      for(const e of collisionTargets){
        if(e.dead||e.hp<=0)continue;
        const t=movingCircleHit(oldX,oldY,missile.x,missile.y,e,missile.r+e.r,origins?.get(e),liveFraction);
        if(t!==null&&t<hitAt)hitAt=t;
      }
      if(hitAt<Infinity){
        missile.x=oldX+(missile.x-oldX)*hitAt;missile.y=oldY+(missile.y-oldY)*hitAt;
        this.explodeMissile(missile,collisionTargets,origins,hitAt*liveFraction);
      }
      else if (missile.life <= 0 || missile.y < -100 || missile.y > 980 || missile.x < -100 || missile.x > 820) missile.dead = true;
    }
    if(this.beam){
      const beam=this.beam,p=this.player,current=this.stats('laser');
      beam.x=p.x;beam.y=p.y-22;beam.width=current.width;beam.damagePerSecond=current.damagePerSecond;
      const targets=this.targets();
      if(this.boosts.homing>0){
        const route=boostedLaserPath(beam,targets,boss);
        beam.path=route?.path||null;
        beam.target=route?.first||null;
        beam.trackingSample=null;
        beam.angle=-Math.PI/2;
        if(beam.path){
          for(const target of targets){
            if(target.dead||target.hp<=0)continue;
            const radius=target.r+beam.width/2;
            for(let i=1;i<beam.path.length;i++){
              if(segmentDistance(beam.path[i-1].x,beam.path[i-1].y,beam.path[i],target)<radius){
                this.damageTarget(target,beam.damagePerSecond*dt*this.damageMultiplier,.08);
                break;
              }
            }
          }
        }
        return;
      }
      beam.path=null;
      const forward=-Math.PI/2,maxAngle=current.maxAngle,turnSpeed=current.turnSpeed;
      const candidates=[];
      for(const target of targets){
        if(target.y>=beam.y || target===boss&&(boss.phaseShield>0||boss.coreLock?.life>0))continue;
        const range=distance(beam,target),angle=angleTo(beam,target),aim=clamp(angle,forward-maxAngle,forward+maxAngle);
        const edge={x:beam.x+Math.cos(aim)*beam.length,y:beam.y+Math.sin(aim)*beam.length};
        const radius=target.r+beam.width/2;
        // Acquire only hulls the beam can actually reach, including a hull crossing the cone edge.
        if(segmentDistance(beam.x,beam.y,edge,target)>=radius)continue;
        const angularRadius=Math.asin(Math.min(1,radius/range));
        const turnTime=Math.max(0,Math.abs(angle-beam.angle)-angularRadius)/turnSpeed;
        candidates.push({target,range,angle,aim,angularRadius,turnTime});
      }
      let selected=candidates.find(candidate=>candidate.target===beam.target);
      const best=candidates.reduce((a,b)=>!a||b.turnTime<a.turnTime-1e-8||Math.abs(b.turnTime-a.turnTime)<1e-8&&b.range<a.range?b:a,null);
      // Hold a useful lock; switch only when another hull can be reached materially sooner.
      if(!selected || best&&best.target!==selected.target&&best.turnTime+.16<selected.turnTime)selected=best;
      beam.target=selected?.target||null;
      let desired=forward;
      if(selected){
        desired=selected.aim;
        const previous=beam.trackingSample,target=selected.target;
        if(dt>0&&previous?.target===target){
          const vx=clamp((target.x-previous.x)/dt,-1200,1200),vy=clamp((target.y-previous.y)/dt,-1200,1200);
          const lookAhead=Math.min(.18,selected.turnTime);
          const predicted={x:target.x+vx*lookAhead,y:target.y+vy*lookAhead};
          // Small lead helps with moving targets without pointing away from their visible hull.
          const lead=clamp(angleTo(beam,predicted)-selected.angle,-selected.angularRadius*.45,selected.angularRadius*.45);
          desired=clamp(selected.angle+lead,forward-maxAngle,forward+maxAngle);
        }
        beam.trackingSample={target,x:target.x,y:target.y};
      }else beam.trackingSample=null;
      beam.angle=clamp(beam.angle+clamp(desired-beam.angle,-turnSpeed*dt,turnSpeed*dt),forward-maxAngle,forward+maxAngle);
      const end={x:beam.x+Math.cos(beam.angle)*beam.length,y:beam.y+Math.sin(beam.angle)*beam.length};
      for(const target of targets){
        if(segmentDistance(beam.x,beam.y,end,target)<target.r+beam.width/2){
          this.damageTarget(target,beam.damagePerSecond*dt*this.damageMultiplier,.08);
        }
      }
    }
  }

  absorbShield(x, y) {
    const shield = this.systems.shield;
    if (shield.active <= 0 || shield.charges <= 0) return false;
    shield.charges--; if (!shield.charges) shield.active = 0;
    this.effect(x, y, '#adc9bf', 7, 0.5); this.ring(x, y, '#adc9bf', 35, 0.2); return true;
  }

  updateHostileLasers(dt,playerStart=this.player) {
    const p = this.player;
    for (const laser of this.hostileLasers) {
      if(laser.life<=0)continue;
      if (laserSourceGone(laser)) { laser.life = 0; continue; }
      if (laser.warning > 0) { laser.warning = Math.max(0, laser.warning - dt); continue; }
      const motion=laser.life<dt?playerMotionUntil(playerStart,p,laser.life/dt):{start:playerStart,end:p};
      const ux = Math.cos(laser.angle), uy = Math.sin(laser.angle);
      const separation = playerSegmentDistance(motion.start,motion.end,
        laser.x,laser.y,laser.x+ux*laser.length,laser.y+uy*laser.length);
      if (separation < p.r + laser.width / 2) this.hitPlayer(CONFIG.laserDamage);
      laser.life -= dt;
    }
    this.hostileLasers = this.hostileLasers.filter(laser => laser.life > 0);
  }

  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    if (dt === 0) return;
    input=input&&typeof input==='object'?input:{};
    for(const key of Object.keys(this.boosts))this.boosts[key]=Math.max(0,this.boosts[key]-dt);
    this.eliteRelief=Math.max(0,this.eliteRelief-dt);
    this.time += dt; updateFinale(this,dt); this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
    if (this.banner) { this.banner.life -= dt; if (this.banner.life < 0) this.banner = null; }
    for (const [key,system] of Object.entries(this.systems)) {
      // Carry only this frame's overshoot, never time spent idle or transforming.
      system.cooldownCarry=key==='missiles'&&system.cooldown>0?Math.max(0,dt-system.cooldown):0;
      system.cooldown=Math.max(0,system.cooldown-dt);system.active=Math.max(0,system.active-dt);
    }
    if (this.systems.shield.active <= 0) this.systems.shield.charges = 0;
    const p = this.player,playerStart={x:p.x,y:p.y,r:p.r};
    p.shotCarry=p.shotTimer>0?Math.max(0,dt-p.shotTimer):0;
    p.invincible = Math.max(0, p.invincible - dt);p.shotTimer=Math.max(0,p.shotTimer-dt);p.focus=!!input.focus;
    const speed = p.focus ? CONFIG.focusSpeed : CONFIG.playerSpeed;
    let dx = Number.isFinite(input.x)?clamp(input.x,-1,1):0;
    let dy = Number.isFinite(input.y)?clamp(input.y,-1,1):0;
    let travelX=0,travelY=0,stopAt=1;
    if (input.target&&Number.isFinite(input.target.x)&&Number.isFinite(input.target.y)) {
      dx = clamp(input.target.x,24,CONFIG.width-24) - p.x;
      dy = clamp(input.target.y,60,CONFIG.height-32) - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0) {
        const fullStep=speed*dt,step=Math.min(d,fullStep);
        travelX=dx/d*fullStep;travelY=dy/d*fullStep;
        stopAt=fullStep>0?step/fullStep:1;
        p.x+=dx/d*step;p.y+=dy/d*step;
      }
    } else {
      const d = Math.hypot(dx, dy) || 1;
      travelX=dx/d*speed*dt;travelY=dy/d*speed*dt;
      p.x+=travelX;p.y+=travelY;
    }
    p.x = clamp(p.x, 24, CONFIG.width - 24); p.y = clamp(p.y, 60, CONFIG.height - 32); p.roll += (clamp(dx, -1, 1) - p.roll) * Math.min(1, dt * 10);
    playerStart.path=playerPath(playerStart,p,travelX,travelY,stopAt);
    this.updateTransform(dt);
    if (input.fire && p.shotTimer <= 0) this.firePlayer();
    if(!this.approachComplete && !this.boss?.midboss){
      let eliteAlive=this.enemies.some(e=>e.elite&&!e.dead&&e.hp>0);
      const gate=this.nextEncounterTime;
      this.routeTime=Math.min(this.routeTime+dt,eliteAlive?gate:Math.min(this.duration,this.nextMidboss?this.nextMidboss.at*this.duration:this.duration));this.spawnTimer-=dt;
      this.routeBlocked=eliteAlive&&this.routeTime>=gate;
      for(const encounter of this.stage.elites){
        if(!eliteAlive&&this.routeTime>=this.duration*encounter.at&&!this.spawnedElites.has(encounter.id)){
          this.spawnedElites.add(encounter.id);
          const firstAce=this.stageId===1&&encounter===this.stage.elites[0],hp=roundHealth(enemyHealth(encounter.type,this.stageId)*(firstAce?.8:1));
          this.spawn(encounter.type,encounter.at<.5?210:510,-80,{encounterId:encounter.id,hp,maxHp:hp,fire:1.75,intro:firstAce});
          eliteAlive=true;this.eliteRelief=this.stageId===1?16:12;this.spawnTimer=Math.max(this.spawnTimer,4);
          this.banner={title:'Elite '+ENEMY_STATS[encounter.type].title,sub:'',life:2.6};
        }
      }
      if(!eliteAlive&&this.nextMidboss&&this.routeTime>=this.duration*this.nextMidboss.at)this.startBoss(true);
      else if(!eliteAlive&&this.routeTime>=this.duration)this.startBoss();
      else if(!this.routeBlocked&&this.routeTime<this.duration-3&&this.spawnTimer<=0)this.formation();
    }
    const movingShots=this.shots.length,movingMissiles=this.missiles.length;
    const motion=movingShots||movingMissiles||this.enemies.length?new Map():null;
    const bossStartX=this.boss?.x,bossStartY=this.boss?.y,bossStartedCharging=!!this.boss?.charging;
    if(motion){
      for(const e of this.enemies)motion.set(e,{x:e.x,y:e.y});
      if(this.boss)motion.set(this.boss,{x:bossStartX,y:bossStartY});
    }
    this.updateEnemies(dt); this.updateBoss(dt); this.autoSystems(dt,playerStart); this.updateWeapons(dt,motion,movingShots,movingMissiles); updateHazards(this,dt,playerStart);
    for (const e of [...this.enemies]) if (!e.dead && e.hp <= 0) this.killEnemy(e);
    const shield = this.systems.shield;
    for (const b of this.bullets) {
      if (b.dead) continue;
      const oldX=b.x,oldY=b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const separation=movingDistance(oldX,oldY,b.x,b.y,playerStart,p);
      const shieldHit=p.invincible<=0&&shield.active>0&&separation<shield.radius+b.r;
      const impact=shieldHit?movingCircleContact(oldX,oldY,b.x,b.y,playerStart,p,shield.radius+b.r):null;
      if (shieldHit && this.absorbShield(impact?.x??b.x,impact?.y??b.y)) b.dead = true;
      if (!b.dead && separation < p.r+b.r && p.invincible <= 0) { b.dead = true; this.hitPlayer(b.damage ?? CONFIG.bulletDamage); }
      if (b.x < -40 || b.x > 760 || b.y < -80 || b.y > 950) b.dead = true;
    }
    for (const e of this.enemies) {
      if (e.dead || e.hp <= 0) continue;
      const previous=motion?.get(e);
      const separation=previous?movingDistance(previous.x,previous.y,e.x,e.y,playerStart,p):distance(e,p);
      // Enemy hulls pass through shields and collide only with the cockpit.
      if (separation < e.r+p.r && p.invincible <= 0) this.hitPlayer(CONFIG.collisionDamage);
    }
    const boss = this.boss;
    if (boss && boss.hp > 0 && (!boss.recovering||bossStartedCharging) && movingBodyBoxHit(bossStartX,bossStartY,boss,playerStart,p) && p.invincible <= 0) {
      this.hitPlayer(CONFIG.bossCollisionDamage);
    }
    this.updateHostileLasers(dt,playerStart);
    this.updatePickups(dt);
    if(boss&&boss.hp<=0){
      startBossDestruction(this,boss);boss.dead=true;
      if(this.state==='playing'){
        if(!queueFinale(this,boss)){
          if(!boss.midboss){this.bullets.length=0;this.hostileLasers.length=0;this.hazards.length=0;}
          this.boss=null;this.shake=.25;
          if(boss.midboss){this.clearedMidbosses.add(boss.midbossId);this.spawnTimer=Math.max(this.spawnTimer,2);this.banner={title:'Mid-boss defeated',sub:'',life:3};}
          else{this.bossDefeated=true;this.banner={title:'Boss defeated',sub:'',life:5};}
        }
      }else{
        // A same-frame loss still destroys the dead hull, but awards no clear.
        this.boss=null;
      }
      this.emit('explode');
    }
    // Linger after the last hull fades, keeping controls and the ordinary pickup magnet active.
    if(this.state==='playing' && this.bossDefeated && !this.bossDestructions.length && !this.enemies.some(e=>!e.dead&&e.hp>0) && !this.clearTime)this.clearTime=this.time;
    if(this.state==='playing' && this.clearTime && this.time-this.clearTime>=BOSS_VICTORY_HOLD && !this.pickups.some(item=>!item.dead)){
      // Departure takes over the player immediately; no weapon should freeze
      // in the playfield while the charging animation runs.
      this.shots.length=0;this.missiles.length=0;this.beam=null;
      this.systems.missiles.active=0;this.systems.laser.active=0;
      this.bullets.length=0;this.hostileLasers.length=0;this.state='victory';this.emit('win');
    }
    this.enemies = this.enemies.filter(e => !e.dead); this.shots = this.shots.filter(s => !s.dead); this.missiles = this.missiles.filter(m => !m.dead);
    this.bullets = this.bullets.filter(b => !b.dead); this.pickups = this.pickups.filter(item => !item.dead); this.updateEffects(dt);
  }

  updateEffects(dt) {
    if(this.state==='paused')return;
    updateBossDestructions(this,dt);
    if(this.particles.length){
      const drag=Math.exp(-dt*3);
      for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=drag;p.vy*=drag;p.life-=dt;}
      this.particles=this.particles.filter(p=>p.life>0);
    }
    if(this.rings.length){
      for(const r of this.rings)r.life-=dt;
      this.rings=this.rings.filter(r=>r.life>0);
    }
  }
}
