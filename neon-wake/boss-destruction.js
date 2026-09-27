// Cosmetic wreckage is separate from living bosses, rewards and collision targets.
export const BOSS_DESTRUCTION_DURATION=1.9;
export const BOSS_VICTORY_HOLD=2;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const noise=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};

export function startBossDestruction(game,boss){
 if(!boss||boss.destructionStarted)return null;
 boss.destructionStarted=true;
 const wreck={age:0,duration:BOSS_DESTRUCTION_DURATION,x:boss.x,y:boss.y,patternId:boss.patternId||game.stageId,
  poseTime:game.time,hull:{x:0,y:0,phase:boss.phase||1,hurt:0,phaseShield:0,finalStand:boss.finalStand,coreExposed:boss.coreExposed}};
 game.bossDestructions.push(wreck);
 return wreck;
}

export function updateBossDestructions(game,dt){
 if(game.state==='paused'||!game.bossDestructions.length)return;
 const step=Number.isFinite(dt)?Math.max(0,dt):0;
 for(const wreck of game.bossDestructions)wreck.age+=step;
 game.bossDestructions=game.bossDestructions.filter(wreck=>wreck.age<wreck.duration);
}

// The real boss artwork is cut into eight moving pieces so every commander
// retains its own silhouette. No gameplay random numbers are consumed here.
export function drawBossDestruction(ctx,wreck,drawHull,reducedMotion=false){
 const {age,duration,x,y,patternId,poseTime}=wreck;
 const progress=clamp(age/duration,0,1),breakup=clamp((age-.15)/1.2,0,1);
 const alpha=clamp((duration-age)/.65,0,1);
 const circle=(cx,cy,r,fill,stroke,width=1)=>{
  ctx.beginPath();ctx.arc(cx,cy,Math.max(.01,r),0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
 };
 ctx.save();ctx.translate(x,y);
 if(reducedMotion){
  // One fading pose avoids the eight drifting, clipped hull redraws.
  ctx.globalAlpha=alpha*(1-progress*.28);
  drawHull(wreck.hull,poseTime,patternId);
 }else{
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,drift=77*breakup*(.55+noise(i+patternId)*.45);
   ctx.save();ctx.globalAlpha=alpha*(1-progress*.28);
   ctx.translate(Math.cos(a)*drift,Math.sin(a)*drift+breakup*16);
   ctx.rotate(.16*Math.sin(i*3.7)*breakup);
   ctx.beginPath();ctx.moveTo(0,0);
   ctx.arc(0,0,200,a-Math.PI/8,a+Math.PI/8);ctx.closePath();ctx.clip();
   drawHull(wreck.hull,poseTime,patternId);
   ctx.restore();
  }
 }
 // A warm core flares once; staggered local bursts travel out along the hull.
 for(let i=0;i<7;i++){
  const delay=i===0?.05:.13+i*.115,life=age-delay;
  if(life<0||life>.65)continue;
  const q=life/.65,a=i*2.399+patternId*.31;
  const reach=i===0?0:(patternId>=10?100:69)*(.6+noise(i+8)*.4);
  const bx=Math.cos(a)*reach,by=Math.sin(a)*reach*.65;
  const radius=(i===0?48:27)*Math.sin(q*Math.PI/2);
  ctx.globalAlpha=(1-q)*(reducedMotion?.35:.65);
  circle(bx,by,radius*1.6,'#c98b6433');
  circle(bx,by,radius,'#ddad75');
  circle(bx,by,radius*.52,'#f3ddad');
 }
 const shock=clamp((age-.42)/1.3,0,1);
 if(age>.42){
  ctx.globalAlpha=(1-shock)*(reducedMotion?.25:.65);
  circle(0,0,30+(reducedMotion?96:240)*(1-(1-shock)**2),null,'#e1b582',2);
  circle(0,0,22+(reducedMotion?72:165)*shock,null,'#cba584',1);
 }
 for(let i=0;i<(reducedMotion?12:42);i++){
  const launch=.12+noise(i+61)*.48,life=age-launch;if(life<0)continue;
  const a=i*2.399+patternId*.51,speed=(26+noise(i+38)*110)*(reducedMotion?.25:1);
  const travel=speed*(1-Math.exp(-life*1.5)),sx=Math.cos(a)*travel,sy=Math.sin(a)*travel+life*life*13;
  ctx.globalAlpha=clamp(1-life/1.4,0,1)*.8;
  ctx.strokeStyle=i%3?'#e9c18b':'#a98a70';ctx.lineWidth=i%4?1.5:3;
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-Math.cos(a)*5,sy-Math.sin(a)*5);ctx.stroke();
 }
 ctx.restore();
}
