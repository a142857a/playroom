import { LEVELS, FORM_KEYS, SYSTEM_KEYS, MAX_RANK, normalizeRank, stageStartingRank, boundedInteger as bounded } from './balance.js';
export { LEVELS, FORMS, FORM_KEYS, SYSTEM_KEYS, MAX_RANK, normalizeRank, weaponStats, stageStartingRank } from './balance.js';

export const SAVE_KEY = 'neon-wake-campaign-v2';
const supportedVersions = new Set([2,3,4,5,6,7,8,9,10,11,12]);
const loadedSave = new WeakMap();
const unreadableSave = Symbol('unreadable save');
const interruptedLoads = new WeakSet();
export const loadedInterruptedAttempt = profile => interruptedLoads.has(profile);
const validForm = form => FORM_KEYS.includes(form) ? form : 'primary';

function migrateRank(arsenal) {
 const rank=Math.max(...SYSTEM_KEYS.map(key=>bounded(arsenal?.[key]?.count,1,MAX_RANK)));
 const oldPower=Math.max(...SYSTEM_KEYS.map(key=>bounded(arsenal?.[key]?.damage,0,600)));
 return normalizeRank(rank+Math.ceil(oldPower/15));
}
// Form choice is a preference. Combat gains are committed only after a clear.
export function retainForm(profile,form) { profile.form=validForm(form); }
export function createProfile() {
 return {version:12,lastStage:1,rank:1,form:'primary',pulses:1,continuation:null,activeAttempt:null,cleared:[],records:{},settledRuns:[]};
}
const validStage = id => Number.isInteger(id)&&id>=1&&id<=LEVELS.length;
const validRun = id => typeof id==='string'&&id.length>0&&id.length<=160;
const validRank = rank => Number.isFinite(rank)&&rank>=1;
const checkpoint = value => ({rank:normalizeRank(value?.rank),pulses:bounded(value?.pulses,0,3,1)});
function recentRuns(value){
 if(!Array.isArray(value))return [];
 const seen=new Set(),runs=[];
 for(let i=value.length-1;i>=0&&runs.length<32;i--){
  const id=value[i];
  if(!validRun(id)||seen.has(id))continue;
  seen.add(id);runs.push(id);
 }
 return runs.reverse();
}

// Preview is read-only. Only the pending next-sector clear carries rank and pulse ammo.
export function getStageCheckpoint(profile,stageId) {
 const target=bounded(stageId,1,LEVELS.length,1);
 const next=profile.continuation?.stageId===target?profile.continuation:null;
 return {rank:Math.max(stageStartingRank(target),next?normalizeRank(next.rank):1),pulses:next?bounded(next.pulses,0,3,1):1};
}

export function beginAttempt(profile,{runId,stageId}={}) {
 if(!validRun(runId)||!validStage(stageId)||profile.settledRuns.includes(runId)||profile.activeAttempt?.runId===runId)return null;
 const start=getStageCheckpoint(profile,stageId);
 // A launch consumes the next-sector continuation, including a different-sector replay.
 profile.continuation=null;
 if(profile.activeAttempt)profile.settledRuns=[...profile.settledRuns,profile.activeAttempt.runId].slice(-32);
 profile.activeAttempt={runId,stageId,start:{...start}};
 profile.rank=start.rank;profile.pulses=start.pulses;profile.lastStage=stageId;
 return {...start};
}

export function sanitizeProfile(raw) {
 const p=createProfile();
 if(!raw||typeof raw!=='object'||!supportedVersions.has(raw.version))return p;
 // Only old schemas read per-system progression; repeated loads cannot add it twice.
 p.rank=raw.version>=9?normalizeRank(raw.rank):migrateRank(raw.arsenal);
 p.pulses=bounded(raw.pulses,0,3,1);
 p.form=validForm(raw.form);
 p.lastStage=bounded(raw.lastStage,1,LEVELS.length,1);
 if(raw.version>=10){
  const active=raw.activeAttempt;
  if(active&&validRun(active.runId)&&validStage(active.stageId)&&active.start&&typeof active.start==='object'&&validRank(active.start.rank)){
   p.activeAttempt={runId:active.runId,stageId:active.stageId,start:checkpoint(active.start)};
   p.rank=p.activeAttempt.start.rank;p.pulses=p.activeAttempt.start.pulses;p.lastStage=active.stageId;
  }
 }
 const cleared=new Set();
 if(Array.isArray(raw.cleared))for(const id of raw.cleared){
  if(validStage(id))cleared.add(id);
  if(cleared.size===LEVELS.length)break;
 }
 for(const stage of LEVELS){
  const r=raw.records?.[stage.id];
  if(r&&typeof r==='object'){
   const bestTime=Number.isFinite(r.bestTime)&&r.bestTime>0?Math.min(86400,r.bestTime):0;
   // Older saves can have a successful record without its matching cleared flag.
   const completed=cleared.has(stage.id)||(Number.isFinite(r.clears)&&r.clears>=1)||bestTime>0;
   const minClears=completed?1:0;
   p.records[stage.id]={clears:bounded(r.clears,minClears,1e6,minClears),bestTime};
   if(completed)cleared.add(stage.id);
  }
 }
 p.cleared=[...cleared].sort((a,b)=>a-b);
 p.settledRuns=recentRuns(raw.settledRuns);
 // Even a malformed attempt marker means this stage may already have started.
 // Do not revive a legacy next-stage checkpoint after an interrupted run.
 if(!p.activeAttempt&&raw.activeAttempt==null){
  const next=raw.continuation;
  if(raw.version>=11&&next&&validStage(next.stageId)&&next.stageId>1&&next.stageId===p.lastStage&&validRank(next.rank)){
   // Version 11 originally kept continuation ammo in the matching checkpoint.
   // Historical checkpoints are read only during migration, never saved again.
   const pulses=raw.version===11?next.pulses??raw.checkpoints?.[next.stageId]?.pulses??raw.pulses:next.pulses;
   p.continuation={stageId:next.stageId,rank:normalizeRank(next.rank),pulses:bounded(pulses,0,3,1)};
  }else if(raw.version===10&&validStage(raw.lastStage)&&raw.lastStage>1&&p.cleared.includes(raw.lastStage-1)&&!p.records[raw.lastStage]&&!p.cleared.includes(raw.lastStage)&&validRank(raw.checkpoints?.[raw.lastStage]?.rank)){
   // A known, never-attempted next checkpoint is the only safe legacy carryover.
   p.continuation={stageId:raw.lastStage,rank:normalizeRank(raw.checkpoints[raw.lastStage].rank),pulses:checkpoint(raw.checkpoints[raw.lastStage]).pulses};
  }
 }
 return p;
}
export function loadProfile(storage){
 try{
  const raw=storage.getItem(SAVE_KEY)??null;
  const profile=sanitizeProfile(raw===null?null:JSON.parse(raw));
  if(profile.activeAttempt){
   interruptedLoads.add(profile);
   const {runId,stageId,start}=profile.activeAttempt;
   profile.rank=start.rank;profile.pulses=1;profile.lastStage=stageId;
   profile.settledRuns=[...new Set([...profile.settledRuns,runId])].slice(-32);
   profile.activeAttempt=null;profile.continuation=null;
  }
  loadedSave.set(profile,raw);
  return profile;
 }catch{
  const profile=createProfile();loadedSave.set(profile,unreadableSave);return profile;
 }
}
function writeProfile(storage,p){
 const raw=JSON.stringify(sanitizeProfile(p));
 storage.setItem(SAVE_KEY,raw);
 loadedSave.set(p,raw);
}
export function saveProfile(storage,p){
 try{
  // A stale game tab must not silently replace a save from a newer version.
  // Keep unreadable data intact too, so the player can recover or explicitly wipe it.
  const existing=storage.getItem(SAVE_KEY)??null;
  if(existing!=null){
   const record=JSON.parse(existing);
   if(!record||typeof record!=='object'||!supportedVersions.has(record.version))return false;
   // A profile created without loading this save has no claim to replace it.
   if(!loadedSave.has(p))return false;
  }
  // A failed read or another tab's write must not turn this tab into an
  // accidental replacement of progress it never loaded.
  if(loadedSave.has(p)&&loadedSave.get(p)!==existing)return false;
  writeProfile(storage,p);return true;
 }catch{return false;}
}
export function resetProfile(storage){
 const profile=createProfile();
 // Confirmation explicitly allows replacing an unreadable or newer save.
 try{writeProfile(storage,profile);}catch{return {profile,saved:false,scoreCleared:false};}
 try{storage.removeItem('neon-wake-best');return {profile,saved:true,scoreCleared:true};}
 catch{return {profile,saved:true,scoreCleared:false};}
}
export function settleRun(p,r) {
 const active=p.activeAttempt;
 if(!r||!validRun(r.runId)||!validStage(r.stageId)||p.settledRuns.includes(r.runId)||!active||active.runId!==r.runId||active.stageId!==r.stageId)return null;
 const start=checkpoint(active.start),earnedRank=Math.max(start.rank,normalizeRank(r.rank)),rankGained=earnedRank-start.rank;
 const won=r.won===true,old=p.records[r.stageId]||{clears:0,bestTime:0};
 const time=Number.isFinite(r.time)&&r.time>0?Math.min(86400,r.time):0;
 p.records[r.stageId]={clears:old.clears+(won?1:0),bestTime:won&&time>0?old.bestTime>0?Math.min(time,old.bestTime):time:old.bestTime};
 if(won&&!p.cleared.includes(r.stageId))p.cleared.push(r.stageId);
 p.cleared.sort((a,b)=>a-b);
 const result=won?{rank:earnedRank,pulses:bounded(r.pulses,0,3,start.pulses)}:{rank:start.rank,pulses:1};
 p.rank=result.rank;p.pulses=result.pulses;
 if(r.form!==undefined)retainForm(p,r.form);
 p.lastStage=won?Math.min(r.stageId+1,LEVELS.length):r.stageId;
 p.continuation=null;
 if(won&&r.stageId<LEVELS.length)p.continuation={stageId:r.stageId+1,...result};
 p.settledRuns=[...p.settledRuns,r.runId].slice(-32);p.activeAttempt=null;
 return {won,startRank:start.rank,rankGained,rank:p.rank};
}
