// Current campaign, weapon, durability and drop tuning. No save data or runtime state.
export const LEVELS = [
  { id: 1, name: 'OUTER REACH', enemyTypes: ['scout', 'dart'], introduce: ['scout', 'dart'], duration: 70, bossName: 'PATROL CARRIER', bossHealth: 54000 },
  { id: 2, name: 'GLASS REEF', enemyTypes: ['scout', 'dart', 'turret', 'weaver'], introduce: ['turret', 'weaver'], duration: 80, bossName: 'PRISM SENTINEL', bossHealth: 190000 },
  { id: 3, name: 'DRIFT FIELDS', theme:'Aimed barrages', formationEnemies:['sniper','turret','sniper','turret','sniper','turret','mine','scout'], enemyTypes: ['scout', 'dart', 'turret', 'weaver', 'sniper', 'mine'], introduce: ['sniper', 'mine'], duration: 90, bossName: 'DEADSTAR ARRAY', bossHealth: 380000 },
  { id: 4, name: 'ION RUN', enemyTypes: ['scout', 'dart', 'turret', 'weaver', 'sniper', 'mine', 'interceptor', 'splitter'], introduce: ['interceptor', 'splitter'], duration: 100, bossName: 'ION REAVER', bossHealth: 630000 },
  { id: 5, name: 'IRON VEIL', theme:'Laser corridors', formationEnemies:['lancer','lancer','lancer','bulwark','lancer','lancer','lancer','bomber'], enemyTypes: ['scout', 'dart', 'turret', 'weaver', 'sniper', 'mine', 'interceptor', 'splitter', 'bomber', 'bulwark', 'lancer'], introduce: ['bomber', 'bulwark', 'lancer'], duration: 110, bossName: 'IRON CITADEL', bossHealth: 960000 },
  { id: 6, name: 'THE WAKE', enemyTypes: ['scout', 'dart', 'turret', 'weaver', 'sniper', 'mine', 'interceptor', 'splitter', 'bomber', 'bulwark', 'lancer'], introduce: [], duration: 120, bossName: 'WAKE SOVEREIGN', bossHealth: 1300000 },
  {id:7,name:'CINDER STRAIT',theme:'Expanding rings',formationEnemies:['bomber','mine','bomber','mine','bomber','mine','weaver','interceptor'],enemyTypes:['scout','dart','turret','weaver','sniper','mine','interceptor','splitter','bomber','bulwark','lancer'],introduce:[],duration: 125, bossName:'KILN MONARCH',bossHealth:1700000,phases:3,midbosses:[{name:'TOLL WARDEN',health:430000,pattern:2,at:.5}]},
  {id:8,name:'GYRE STATION',enemyTypes:['scout','dart','turret','weaver','sniper','mine','interceptor','splitter','bomber','bulwark','lancer'],introduce:[],duration: 130, bossName:'GYRE ENGINE',bossHealth:2100000,phases:3,midbosses:[{name:'AXIS KEEPER',health:530000,pattern:8,at:.5}]},
  {id:9,name:'ASHEN EXPANSE',theme:'Homing pursuit',formationEnemies:['seeker','pursuer','seeker','pursuer','seeker','pursuer','weaver','bulwark'],enemyTypes:['scout','dart','turret','weaver','sniper','mine','interceptor','splitter','bomber','bulwark','lancer','seeker','pursuer'],introduce:['seeker','pursuer'],duration: 135, bossName:'ASH LEVIATHAN',bossHealth:2500000,phases:4,midbosses:[{name:'METEOR SHEPHERD',health:630000,pattern:3,at:.5}]},
  {id:10,name:'LAST LIGHT',enemyTypes:['scout','dart','turret','weaver','sniper','mine','interceptor','splitter','bomber','bulwark','lancer','seeker','pursuer'],introduce:[],duration: 140, bossName:'WAKE ARCHITECT',bossHealth:2900000,phases:5,midbosses:[{name:'CROWN SENTINEL',health:740000,pattern:10,at:.5},{name:'DUSK HARBINGER',health:650000,pattern:9,at:.85}]},
];


// Stable encounter IDs schedule the two mandatory elite fights in each sector.
const eliteTypes=[['ace','ace'],['ace','ace'],['ace','ace'],['siege','bastion'],['siege','siege'],['siege','bastion'],['bastion','bastion'],['ace','bastion'],['bastion','bastion'],['bastion','ace']];
for(const stage of LEVELS){
 stage.elites=eliteTypes[stage.id-1].map((type,i)=>({type,at:i===0?.30:.75,id:'sector-'+stage.id+'-elite-'+(i+1)}));
 stage.midbosses=(stage.midbosses||[]).map((boss,i)=>({...boss,id:'sector-'+stage.id+'-midboss-'+(i+1)}));
}

export const FORM_KEYS = ['primary', 'missiles', 'laser'];
export const FORMS = {
 primary: {name:'Spread'},
 missiles: {name:'Missiles'},
 laser: {name:'Laser'},
};
export const SYSTEM_KEYS = [...FORM_KEYS, 'shield', 'pulse'];

// Bounds imported save data while keeping previously earned ranks.
export const MAX_RANK = 10000;
export const boundedInteger = (v, low, high, fallback = low) => Number.isFinite(v) ? Math.max(low, Math.min(high, Math.floor(v))) : fallback;

export function normalizeRank(value) {
 return boundedInteger(value,1,MAX_RANK);
}
export function weaponStats(key,rank) {
 if(!SYSTEM_KEYS.includes(key))return null;
 const current=normalizeRank(rank),ranks=current-1,multiplier=1+ranks*.25,countGrowth=1+ranks/3,fireRate=1+Math.min(.4,ranks*.2/39);
 if(key==='primary'){
  const shots=1+Math.round(ranks/3);
  return {rank:current,count:shots,shotCount:shots,damage:90*multiplier,interval:.15/fireRate,spread:Math.min(.11,1.1/(shots-1))};
 }
 // Two opening rockets keep missed early rank pickups from stalling the first boss.
 if(key==='missiles')return {rank:current,count:Math.max(2,1+Math.round(ranks/3)),damage:200*multiplier,cooldown:1/fireRate,speed:Math.min(820,560+ranks*5),radius:Math.min(90,48+ranks*.6)};
 if(key==='laser')return {rank:current,count:1,damagePerSecond:200*multiplier*countGrowth,width:Math.min(46,16+ranks*.8),homing:true,continuous:true,maxAngle:Math.min(50,5+ranks*.5)*Math.PI/180,turnSpeed:Math.min(100,10+ranks)*Math.PI/180,cooldown:0};
 if(key==='pulse')return {rank:current,damage:1200*multiplier};
 return {rank:current,charges:Math.min(4,2+Math.floor(ranks/3)),duration:3.5+Math.min(1.5,ranks*.05),cooldown:Math.max(8,16-ranks*.12),radius:45};
}
export const stageStartingRank = stageId => 5*boundedInteger(stageId,1,LEVELS.length,1)-4;

// Relative encounter pressure: a gentle reduction in sector two, increasing toward the finale.
const SECTOR_TUNING = Object.freeze([
 [1,1,1,1], [.88,1.10,1.12,1.08], [.84,1.15,1.18,1.10], [.80,1.20,1.24,1.12],
 [.76,1.25,1.30,1.14], [.72,1.30,1.36,1.16], [.68,1.35,1.42,1.18],
 [.64,1.40,1.48,1.20], [.60,1.45,1.54,1.22], [.56,1.50,1.60,1.24],
].map(([health,spawnInterval,fireInterval,warning],index)=>Object.freeze({health,spawnInterval,fireInterval,warning,normalDensity:index===0?1:index===1?.75:.6})));
export const sectorTuning = stageId => SECTOR_TUNING[boundedInteger(stageId,1,LEVELS.length,1)-1];


export const CONFIG = Object.freeze({
  width: 720, height: 900, maxHp: 100, pulses: 1, maxPulses:3,
  bulletDamage: 12, collisionDamage: 22, bossCollisionDamage: 35, laserDamage: 24, hitGrace: 0.2,
  playerSpeed: 430, focusSpeed: 190, hitRadius: 5,
  bulletSpeed: 820, enemyBulletSpeed: 0.42, bossBulletSpeed: 0.75,
  transformDelay: 0.45,
});

export const HOMING_ATTACK_TUNING=Object.freeze({speed:1.65,turnRate:2.25,damage:30});

export const BOOSTS=Object.freeze({invincible:{label:'Invincible',duration:12},damage:{label:'Triple damage',duration:15},homing:{label:'Homing',duration:18}});
export const BOOST_DROP_CHANCE=.015;
export const PULSE_DROP_CHANCE=.01;
// A short opening bonus fades evenly over the first three sectors.
export const pickupDropMultiplier=stageId=>[1.3,1.2,1.1][boundedInteger(stageId,1,LEVELS.length,1)-1]??1;
export const HEAL_PICKUP_AMOUNT=50, HEAL_DROPS_PER_LEVEL=.5;
// Ordinary route kills, including splitter children, from the scheduled formations.
// Normalize the odds so the longer, busier sectors do not shower the player in repairs.
const REPAIR_KILL_BUDGET=[54,74,60,105,54,118,85,126,83,127];
export const healDropChance=stageId=>HEAL_DROPS_PER_LEVEL*pickupDropMultiplier(stageId)/REPAIR_KILL_BUDGET[boundedInteger(stageId,1,LEVELS.length,1)-1];
export const RANK_DROP_CHANCE=.04, PULSE_PICKUP_CHARGES=1;

export const ENEMY_STATS = Object.freeze({
  ace: { hp: 4000, durability: 8, r: 30, speed: 100, cooldown: 1.2, title: 'ACE', elite: true },
  siege: { hp: 7600, durability: 12, r: 38, speed: 36, cooldown: 5, title: 'SIEGE', elite: true },
  bastion: { hp: 11000, durability: 16, r: 44, speed: 34, cooldown: 2.8, title: 'BASTION', elite: true },
  scout: { hp: 360, durability: 0.8, r: 20, speed: 115, cooldown: 2.1, title: 'SCOUT' },
  dart: { hp: 280, durability: 0.6, r: 16, speed: 245, cooldown: 9, title: 'DART' },
  turret: { hp: 1250, durability: 1.8, r: 28, speed: 64, cooldown: 1.8, title: 'GUNSHIP' },
  weaver: { hp: 880, durability: 1.5, r: 24, speed: 86, cooldown: 2, title: 'WEAVER' },
  sniper: { hp: 2100, durability: 3, r: 23, speed: 39, cooldown: 3.1, title: 'SNIPER' },
  mine: { hp: 660, durability: 1.2, r: 22, speed: 51, cooldown: 3.5, title: 'PULSE MINE' },
  interceptor: { hp: 1200, durability: 1.8, r: 21, speed: 188, cooldown: 1.65, title: 'INTERCEPTOR' },
  splitter: { hp: 2100, durability: 2.8, r: 29, speed: 77, cooldown: 2.5, title: 'SPLITTER' },
  bomber: { hp: 4600, durability: 4, r: 36, speed: 44, cooldown: 3, title: 'BOMBER' },
  bulwark: { hp: 5700, durability: 4.6, r: 34, speed: 48, cooldown: 2.2, title: 'BULWARK' },
  seeker: { hp: 4200, durability: 3.2, r: 25, speed: 58, cooldown: 3.4, title: 'SEEKER' },
  pursuer: { hp: 6200, durability: 4.8, r: 30, speed: 44, cooldown: 4.2, title: 'PURSUER' },
  lancer: { hp: 7800, durability: 6.5, r: 32, speed: 58, cooldown: 5.2, title: 'LANCER' },
});

// Hulls use steps of 25 below 1,000, then 100 / 1,000 / 10,000 as their scale grows.
export function roundHealth(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = Math.max(25, 10 ** (Math.floor(Math.log10(value)) - 1));
  return Math.max(step, Math.round(value / step) * step);
}

// Durability is measured against the sector's fixed starting rank, never the live player rank.
// The flat hull floor keeps early introductions sturdy. The fixed durability curve follows
// quadratic rank growth independently of live weapon damage, so weapon tuning never changes hulls.
export function enemyHealth(type, stageId) {
  const stats = ENEMY_STATS[type];
  if (!stats) return 0;
  const sector = Math.max(1, Math.min(LEVELS.length, Math.floor(Number(stageId)) || 1));
  const ranks = stageStartingRank(sector) - 1;
  const baselineDps = 200 * (1 + ranks * .25) * (1 + ranks / 3);
  return roundHealth(Math.max(stats.hp * (.9 + (sector - 1) * .2), baselineDps * stats.durability) * sectorTuning(sector).health);
}

export const BOSS_PHASE_SHIELD_DURATION = 3;
export const CORE_OPEN_DURATION = 6;
export const FINALE_DELAY = 2.5;
export const FINALE_FIREBALL_CAP = 40;
