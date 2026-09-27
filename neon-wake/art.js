import { BOSS_PHASE_SHIELD_DURATION, rotorSegments } from './encounters.js';
import { drawBossDestruction } from './boss-destruction.js';

// Canvas artwork shares one cool friendly palette and one warm hostile palette.
const FRIENDLY = {edge:'#a2cbbd',bright:'#ecf1de',body:'#b8cfc3'};
// Shared vertex counts let every form fold into the final aircraft without
// dropping a wing vertex. Repeated center points preserve the original hulls.
const FORM_HALVES={
 primary:[[0,-43],[7,-23],[10,-10],[24,1],[43,12],[47,23],[29,20],[18,15],[15,29],[6,27],[0,35],[0,35]],
 missiles:[[0,-31],[8,-14],[15,-3],[20,-18],[21,-36],[29,-33],[34,9],[44,29],[29,22],[23,36],[0,25],[0,25]],
 trinity:[[0,-61],[6,-31],[18,-15],[25,-41],[34,-36],[36,1],[58,22],[60,32],[36,24],[25,37],[11,33],[0,44]],
 laser:[[0,-53],[5,-30],[9,-7],[17,2],[23,16],[28,27],[16,23],[11,13],[10,31],[4,28],[0,37],[0,37]]
};
const knownForm=form=>FORM_HALVES[form]?form:'primary';
function morphState(form,transform){
 const from=knownForm(transform?.from||form),to=knownForm(transform?.target||transform?.to||from);
 const linear=transform?Math.max(0,Math.min(1,Number.isFinite(transform.progress)?transform.progress:1-(transform.remaining??.45)/(transform.duration||.45))):0;
 return {from,to,linear,blend:linear*linear*(3-2*linear)};
}
export function formSilhouette(form='primary',transform=null){
 const {from,to,blend}=morphState(form,transform);
 const half=FORM_HALVES[from].map(([x,y],i)=>[x+(FORM_HALVES[to][i][0]-x)*blend,y+(FORM_HALVES[to][i][1]-y)*blend]);
 return [...half,...half.slice(1,-1).reverse().map(([x,y])=>[-x,y])];
}
// The last ten route seconds build speed before either kind of boss.
export function backgroundPace(game) {
 if(game.boss||game.approachComplete||game.bossDefeated)return 1;
 const next=game.duration*(game.nextMidboss?.at??1);
 const approach=Math.max(0,Math.min(1,(game.routeTime-next+10)/10));
 return 1+2.6*approach*approach;
}
export function advanceBackground(motion,dt,target=1) {
 const elapsed=Math.max(0,Math.min(.1,dt));
 const speed=target+(motion.speed-target)*Math.exp(-elapsed*1.6);
 return {speed,distance:motion.distance+18*(motion.speed+speed)*.5*elapsed};
}
const atlas=typeof Image==='undefined'?null:new Image();
// Paused scenes draw once, then need a single redraw if the atlas arrives later.
const backgroundLoadListeners=new Set();
if(atlas){
 const notify=()=>{for(const listener of backgroundLoadListeners)listener();};
 atlas.addEventListener?.('load',notify);
 atlas.addEventListener?.('error',notify);
 atlas.src=new URL('./sector-atlas.png',import.meta.url).href;
}
export const backgroundLoadSettled=()=>!atlas||atlas.complete;
export function onBackgroundLoad(listener){
 backgroundLoadListeners.add(listener);
 return ()=>backgroundLoadListeners.delete(listener);
}
const motionPreference=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
let reducedMotion=!!motionPreference?.matches;
const updateMotionPreference=event=>{reducedMotion=event.matches;};
if(motionPreference?.addEventListener)motionPreference.addEventListener('change',updateMotionPreference);
else motionPreference?.addListener?.(updateMotionPreference);
export function createArtwork(ctx,{polygon,line,circle,label}) {
 const F=FRIENDLY;
 const camera={x:0,time:null,stage:0,motion:{speed:1,distance:0}};
 let backgroundTile=null;
 let warningSignDrawn=false;
 // Scenery stays faint and behind combat. Near layers travel faster than the
 // illustration, with each sector using the material visible in its landscape.
 const scenery=['stars','glass','wreckage','clouds','panels','dust','embers','panels','ash','clouds'];
 const sceneryColors=['#c6cfc7','#94b9b2','#a59681','#d3c5b6','#ac9e87','#a9b8b4','#c98e65','#b6aa91','#c2aa91','#d7c6af'];
 function passingScenery(t,cell){
  const kind=scenery[cell],cloudy=kind==='clouds'||kind==='ash',count=cloudy?7:24;
  ctx.save();
  for(let i=0;i<count;i++){
   const near=(i%3+1)/3,speed=cloudy?9+near*8:13+near*16;
   const span=1260,y=((i*197+cell*89+t*speed)%span+span)%span-180;
   // Solid scenery follows the edges, leaving the flight path visually clear.
   const solid=['glass','wreckage','panels'].includes(kind);
   const baseX=solid?(i%2?660-(i*43)%124:60+(i*37)%124):(i*181+cell*71)%720;
   const x=baseX+Math.sin(t*.07+i)*9-camera.x*(9+near*14);
   ctx.save();ctx.translate(x,y);
   ctx.globalAlpha=cloudy?.028:solid?.085:.13;
   const color=sceneryColors[cell],r=4+near*7;
   if(cloudy){
    ctx.scale(1.8,1);
    circle(0,0,66+near*55,color);
    circle(32,-15,48+near*40,color);
   }else if(kind==='glass'){
    ctx.rotate(i*.73);
    polygon([[0,-r*2],[r*.65,-r*.3],[r*.4,r*1.4],[-r*.8,r*.6],[-r*.5,-r]],color);
    line(0,-r*2,-r*.1,r*.9,'#c4d4c8',1);
   }else if(kind==='wreckage'){
    ctx.rotate(i*.91+t*.025);
    polygon([[-r,-r*.6],[r*.2,-r],[r,r*.1],[r*.5,r],[-r*.8,r*.7]],color);
   }else if(kind==='panels'){
    ctx.rotate((i%3-1)*.22);
    ctx.fillStyle=color;ctx.fillRect(-r,-r*2,r*2,r*4);
    line(-r*.6,-r*.8,r*.6,-r*.8,'#dbcead',1);
    line(-r*.6,r*.8,r*.6,r*.8,'#dbcead',1);
   }else{
    circle(0,0,kind==='embers'?1.3+near:kind==='dust'?1+near*1.8:.7+near,color);
   }
   ctx.restore();
  }
  ctx.restore();
 }
 function background(t,stage=1,player=null,pace=1){
  warningSignDrawn=false;
  ctx.fillStyle='#28292b';ctx.fillRect(0,0,720,900);
  const cell=Math.max(0,Math.min(9,stage-1)),col=cell%5,row=Math.floor(cell/5);
  const dt=camera.time===null?0:Math.max(0,Math.min(.1,t-camera.time));
  if(camera.stage!==stage){camera.x=0;camera.motion={speed:1,distance:0};backgroundTile=null;camera.stage=stage;}
  camera.time=t;
  camera.motion=advanceBackground(camera.motion,reducedMotion?0:dt,pace);
  const targetX=reducedMotion||!player?0:Math.max(-1,Math.min(1,(player.x-360)/360));
  camera.x=reducedMotion?0:camera.x+(targetX-camera.x)*(1-Math.exp(-dt*3));
  if(atlas?.complete&&atlas.naturalWidth&&backgroundTile===null){
   // Decorative art must not stop combat if a constrained browser cannot
   // allocate the large tile. Retry when the sector changes.
   backgroundTile=false;
   try{
    // Feathered overlapping copies scroll forever without a hard reset or edge seam.
    let tile=null,tileCtx=null;
    if(typeof OffscreenCanvas==='function'){
     try{
      tile=new OffscreenCanvas(960,1200);
      tileCtx=tile.getContext('2d');
     }catch{/* Try a regular canvas when offscreen allocation is unavailable. */}
    }
    if(!tileCtx && typeof document!=='undefined'){
     tile=document.createElement('canvas');
     tile.width=960;tile.height=1200;
     tileCtx=tile.getContext('2d');
    }
    if(tileCtx){
     const sx=Math.ceil(col*atlas.naturalWidth/5)+2,sy=Math.ceil(row*atlas.naturalHeight/2)+2;
     const sw=Math.floor((col+1)*atlas.naturalWidth/5)-sx-2,sh=Math.floor((row+1)*atlas.naturalHeight/2)-sy-2;
     tileCtx.drawImage(atlas,sx,sy,sw,sh,0,0,960,1200);
     const feather=tileCtx.createLinearGradient(0,0,0,1200);
     feather.addColorStop(0,'#0000');feather.addColorStop(1/12,'#000');
     feather.addColorStop(11/12,'#000');feather.addColorStop(1,'#0000');
     tileCtx.globalCompositeOperation='destination-in';tileCtx.fillStyle=feather;tileCtx.fillRect(0,0,960,1200);
     backgroundTile=tile;
    }
   }catch{/* Optional background art is unavailable; flat fill and scenery remain. */}
  }
  const x=-120-camera.x*10,offset=camera.motion.distance%1000;
  if(backgroundTile)for(let y=offset-1100;y<900;y+=1000)ctx.drawImage(backgroundTile,x,y);
  ctx.fillStyle='#171e20a3';ctx.fillRect(0,0,720,900);
  passingScenery(camera.motion.distance/18,cell);
  const shade=ctx.createLinearGradient(0,0,0,900);shade.addColorStop(0,'#27232312');shade.addColorStop(1,'#171f2238');ctx.fillStyle=shade;ctx.fillRect(0,0,720,900);
 }
 function pickup(item,t){
  if(!['rank','boost','pulse','heal'].includes(item.type))return;
  if(reducedMotion)t=0;
  ctx.save();ctx.translate(item.x,item.y);
  const rank=item.type==='rank',boost=item.type==='boost',ammo=item.type==='pulse',heal=item.type==='heal',r=rank?24:boost||heal?23:25;
  const edge=rank?F.bright:boost?'#bcdace':F.edge;
  const halo=ctx.createRadialGradient(0,0,10,0,0,40);
  halo.addColorStop(0,rank?'#cfdfc042':'#b6e0cd35');halo.addColorStop(1,'#a2cbbd00');circle(0,0,40,halo);
  ctx.save();ctx.rotate(t*(rank?.55:-.4));
  const points=ammo?6:rank?4:3;
  for(let i=0;i<points;i++){
   ctx.rotate(Math.PI*2/points);
   polygon([[0,-36],[3,-31],[0,-27],[-3,-31]],rank?F.bright:'#c9e5d8');
   ctx.beginPath();ctx.arc(0,0,31,-1.32,-.62);ctx.strokeStyle=rank?'#b7d8c599':'#badfcd88';ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.restore();
  circle(0,0,r+4,'#1e2b2acc');
  if(ammo){circle(0,0,r,'#d5ded0',F.bright,2);circle(0,0,r-4,'#37534e',F.edge,1.5);for(const side of [-1,1])polygon([[side*27,0],[side*32,-5],[side*37,0],[side*32,5]],F.bright);}
  else if(heal){polygon([[-17,-23],[17,-23],[23,-17],[23,17],[17,23],[-17,23],[-23,17],[-23,-17]],'#354e3e','#d0e4bc',2.5);}
  else if(rank){circle(0,0,r,'#35514a',edge,2.5);circle(0,0,r-4,null,'#a9c8b8',1);}
  else if(boost){polygon(Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*r,Math.sin(i*Math.PI/3)*r]),'#213a3a',edge,2);polygon(Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*(r-4),Math.sin(i*Math.PI/3)*(r-4)]),null,'#85b4a3',1);}
  ctx.lineCap='round';ctx.lineJoin='round';
  const key=heal?'heal':ammo?'pulse':boost?item.boost:'rank';
  if(rank){
   line(-10,3,0,-7,F.bright,3.5);line(0,-7,10,3,F.bright,3.5);
   line(0,1,0,12,F.edge,3);
  }
  else if(key==='heal'){line(-11,0,11,0,'#e3f0d4',7);line(0,-11,0,11,'#e3f0d4',7);}
  else if(key==='pulse'){circle(0,0,10,null,F.bright,2);circle(0,0,4,F.bright);}
  else if(key==='invincible')polygon([[0,-13],[4,-4],[13,0],[4,4],[0,13],[-4,4],[-13,0],[-4,-4]],F.bright);
  else if(key==='damage')label('×3',0,6,17,F.bright,'center',700);
  else if(key==='homing'){circle(0,0,8,null,F.bright,2);circle(0,0,2,F.bright);for(const [x,y]of [[1,0],[-1,0],[0,1],[0,-1]])line(x*10,y*10,x*14,y*14,F.bright,2);}
  ctx.restore();
 }
 function shield(p,system,t){
  if(system.active<=0||system.charges<=0)return;
  if(reducedMotion)t=0;
  const ending=system.active<1.2,fade=Math.min(1,system.active/.5);
  ctx.save();
  // Never blink fully invisible while protection remains. The final second fades faster.
  ctx.globalAlpha=ending?(reducedMotion?.71:.42+.58*(.5+.5*Math.sin(system.active*Math.PI*5)))*(.35+.65*fade):1;
  circle(p.x,p.y,system.radius,'#b5d7bf13',F.edge,2.5);
  ctx.translate(p.x,p.y);ctx.rotate(t*1.5);
  for(let i=0;i<system.charges;i++){
   ctx.beginPath();ctx.arc(0,0,system.radius+4,i*Math.PI*2/system.charges,i*Math.PI*2/system.charges+.32);
   ctx.strokeStyle=F.bright;ctx.lineWidth=3;ctx.stroke();
  }
  if(ending){ctx.rotate(-t*1.5-Math.PI/2);ctx.beginPath();ctx.arc(0,0,system.radius+8,0,Math.PI*2*system.active/1.2);ctx.strokeStyle=F.bright;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.restore();
 }
 function aircraft(p,t,form='primary',transform=null) {
  if(p.hp<=0)return;
  if(reducedMotion)t=0;
  const {from,to,linear,blend}=morphState(form,transform),fold=Math.sin(linear*Math.PI);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate((p.roll||0)*.1);
  if(p.invincible>0)ctx.globalAlpha=.7+Math.sin(t*35)*.18;
  // A faint outer arc announces the short transformation, leaving the core clear.
  if(transform&&fold>.01){
   ctx.save();ctx.globalAlpha*=fold*.65;
   for(const side of [-1,1]){
    ctx.beginPath();ctx.arc(0,0,49+fold*4,side>0?-.65:Math.PI-.65,side>0?.65:Math.PI+.65);
    ctx.strokeStyle=F.bright;ctx.lineWidth=1.5;ctx.stroke();
   }
   ctx.restore();
  }
  ctx.scale(1-fold*.09,1);
  const layers=from===to?[[from,1]]:[[from,1-blend],[to,blend]];
  for(const [kind,alpha] of layers){
   if(alpha<=0)continue;
   ctx.save();ctx.globalAlpha*=alpha;
   const engines=kind==='trinity'?[-29,-10,10,29]:kind==='missiles'?[-24,24]:kind==='laser'?[-7,7]:[-13,13];
   const base=kind==='missiles'?33:kind==='laser'?30:26;
   for(const x of engines){
    polygon([[x-4,base],[x,base+20+Math.sin(t*38)*4],[x+4,base]],'#9ec5b670');
    polygon([[x-2,base],[x,base+13+Math.sin(t*38)*2],[x+2,base]],F.bright);
   }
   ctx.restore();
  }
  polygon(formSilhouette(form,transform),F.body,F.edge,1.7);
  for(const [kind,alpha] of layers){
   if(alpha<=0)continue;
   ctx.save();ctx.globalAlpha*=alpha;
   if(kind==='primary'){
    // Broad swept wings and four exposed barrels advertise the spread pattern.
    for(const side of [-1,1]){
     polygon([[side*9,-9],[side*40,15],[side*29,14],[side*12,5]],side<0?'#e5e9db':'#95b5a7');
     for(const x of [23,34]){
      const y=x===23?4:11;
      polygon([[side*(x-3),y],[side*(x-2),y-13],[side*(x+2),y-13],[side*(x+3),y+8]],'#65887b',F.edge,1);
      line(side*x,y-12,side*x,y-7,F.bright,2);
     }
    }
    polygon([[0,-42],[6,-15],[6,22],[0,31],[-6,22],[-6,-15]],'#e3e7d8');
   }else if(kind==='missiles'){
    // Long armored side pods and a short nose give the missile form a forked hull.
    for(const side of [-1,1]){
     polygon([[side*11,-2],[side*23,-13],[side*37,22],[side*17,12]],side<0?'#e5e9db':'#95b5a7');
     polygon([[side*19,-20],[side*22,-34],[side*27,-32],[side*31,-15],[side*29,30],[side*21,33]],'#6f9484',F.edge,1.5);
     polygon([[side*22,-24],[side*24,-31],[side*27,-24],[side*28,-12],[side*22,-12]],'#e9ecdc');
     for(const y of [-6,3,12])line(side*23,y,side*28,y,F.bright,2);
     line(side*23,24,side*27,24,'#dce8d5',3);
    }
    polygon([[0,-30],[6,-13],[8,12],[0,22],[-8,12],[-6,-13]],'#e0e6d6');
   }else if(kind==='trinity'){
    for(const side of [-1,1]){
     polygon([[side*12,-8],[side*55,24],[side*34,19],[side*18,7]],side<0?'#edf0df':'#a2bfb0');
     polygon([[side*22,-26],[side*27,-39],[side*32,-33],[side*34,22],[side*25,31]],'#6d9283',F.bright,1.7);
     for(const y of [-19,-8,3])line(side*26,y,side*31,y,'#e4edd3',3);
     for(const x of [42,50])line(side*x,13,side*x,25,F.bright,3);
    }
    polygon([[0,-60],[5,-32],[8,23],[0,41],[-8,23],[-5,-32]],'#edf0df',F.edge,1.5);
    line(0,-53,0,-28,'#698c7b',4);circle(0,-41,5,'#35554c',F.bright,1.5);circle(0,-41,2.5,'#fff2cf');
   }else{
    // A narrow dart, long dorsal rail and open emitter define the laser form.
    for(const side of [-1,1]){
     polygon([[side*7,-8],[side*23,22],[side*15,17],[side*8,7]],side<0?'#e9ebdc':'#91b3a3');
     line(side*11,9,side*16,24,'#688d7d',2);
    }
    polygon([[0,-52],[4,-28],[6,21],[0,33],[-6,21],[-4,-28]],'#e9ebdc');
    line(0,-47,0,-24,'#628677',3);
    circle(0,-35,5,'#35554c',F.edge,1);
    circle(0,-35,2.5,F.bright);
    line(-3,-48,-3,-40,F.bright,1.5);line(3,-48,3,-40,F.bright,1.5);
   }
   ctx.restore();
  }
  // The cockpit stays fixed while the hardware folds around it. The game's light-blue
  // collision marker is painted over this artwork at the same player position.
  polygon([[0,-24],[4,-13],[3,0],[0,6],[-3,0],[-4,-13]],'#34534e',F.edge,1);
  line(-2,-17,-2,-9,'#91b3a3',1);
  ctx.restore();
  if(p.focus)circle(p.x,p.y,29,null,'#a2cbbd60');
 }
 function flagship(b,t,stage){
  if(reducedMotion)t=0;
  ctx.save();ctx.translate(b.x,b.y);
  if(b.recovering)ctx.globalAlpha=.45;
  const fill=b.hurt>0?'#eed8be':'#443b36',edge=b.phase>=2?'#e5987c':'#caaa7b',dark='#28272b';
  if(stage===1){
   polygon([[-114,-30],[-70,-45],[70,-45],[114,-30],[102,30],[50,44],[-50,44],[-102,30]],fill,edge,2);
   polygon([[-28,-50],[28,-50],[34,38],[0,55],[-34,38]],'#6a5a48',edge,2);
   for(const x of [-73,73]){ctx.fillStyle=dark;ctx.fillRect(x-20,-20,40,50);for(let y=-12;y<30;y+=13)line(x-13,y,x+13,y,edge,2);}
  }else if(stage===2){
   polygon([[0,-76],[43,-10],[28,50],[0,70],[-28,50],[-43,-10]],fill,edge,2);
   for(const x of [-76,76]){polygon([[x,-42],[x+23,0],[x,43],[x-23,0]],'#624b3b',edge,2);line(x,-15,x,20,'#e8be8a',4);line(Math.sign(x)*33,0,x-Math.sign(x)*23,0,'#765e49',3);}
   polygon([[0,-45],[18,0],[0,39],[-18,0]],'#d7ac7c',edge,1);
  }else if(stage===3){
   circle(0,0,67,fill,edge,3);circle(0,0,45,dark,edge,2);
   for(let i=0;i<6;i++){const a=i*Math.PI/3+t*.12,x=Math.cos(a)*76,y=Math.sin(a)*76;line(x*.65,y*.65,x,y,edge,7);polygon([[x-14,y-17],[x+14,y-17],[x+18,y+13],[x-18,y+13]],fill,edge,2);}
   circle(0,0,22,'#a36e48','#dca878',3);
  }else if(stage===4){
   polygon([[-116,-45],[-22,-19],[33,-68],[22,-9],[100,38],[34,20],[-10,69],[-12,16]],fill,edge,2);
   polygon([[-68,-22],[18,-7],[46,27],[-5,7]],'#986849',edge,2);
   line(-5,-20,-5,30,'#e4b78a',5);circle(-4,0,14,dark,edge,2);
  }else if(stage===5){
   polygon([[-87,-62],[87,-62],[101,34],[63,65],[-63,65],[-101,34]],fill,edge,3);
   for(const x of [-70,70])for(const y of [-39,32]){ctx.fillStyle=dark;ctx.fillRect(x-19,y-19,38,38);ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.strokeRect(x-19,y-19,38,38);line(x,y-5,x,y+28,edge,7);}
   polygon([[-25,-37],[25,-37],[38,21],[0,44],[-38,21]],'#6f4e3c',edge,2);
  }else if(stage===6){
   circle(0,0,71,null,edge,12);circle(0,0,59,null,'#675046',4);
   for(let i=0;i<4;i++){const a=i*Math.PI/2+t*.3,x=Math.cos(a)*94,y=Math.sin(a)*94;ctx.save();ctx.translate(x,y);ctx.rotate(a);polygon([[-17,-18],[17,-27],[28,0],[17,27],[-17,18]],fill,edge,2);ctx.restore();}
   polygon([[0,-35],[32,-16],[25,24],[0,38],[-25,24],[-32,-16]],fill,edge,2);
  }
  if(stage===7){
   polygon([[-110,-45],[-45,-30],[-20,-65],[20,-65],[45,-30],[110,-45],[90,48],[25,62],[-25,62],[-90,48]],fill,edge,3);
   for(const x of [-70,0,70]){polygon([[x-13,-24],[x+13,-24],[x+17,35],[x-17,35]],dark,edge,2);line(x,-12,x,28,'#e5a36c',7);}
  }else if(stage===8){
   circle(0,0,55,fill,edge,3);for(let i=0;i<4;i++){ctx.save();ctx.rotate(t*.28+i*Math.PI/2);polygon([[38,-17],[94,-25],[118,0],[94,25],[38,17]],fill,edge,3);line(67,0,102,0,'#dec399',5);ctx.restore();}circle(0,0,29,dark,edge,3);
  }else if(stage===9){
   polygon([[-130,-25],[-73,-60],[-25,-30],[0,-48],[25,-30],[73,-60],[130,-25],[100,36],[45,65],[0,35],[-45,65],[-100,36]],fill,edge,3);
   for(const x of [-82,-38,38,82])circle(x,0,18,dark,edge,3);polygon([[-14,-27],[14,-27],[25,24],[0,50],[-25,24]],'#946d4c',edge,2);
  }else if(stage===10){
   for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*Math.PI*2/5+t*.1);polygon([[-16,-45],[-29,-105],[0,-140],[29,-105],[16,-45]],fill,edge,3);line(0,-61,0,-107,'#e7bd90',5);ctx.restore();}
   circle(0,0,51,dark,edge,4);polygon([[0,-37],[35,-12],[22,30],[-22,30],[-35,-12]],fill,edge,3);
  }
  if(stage===11){
   const halo=ctx.createRadialGradient(0,0,28,0,0,158);halo.addColorStop(0,'#efc48c55');halo.addColorStop(1,'#efc48c00');circle(0,0,158,halo);
   for(let i=0;i<8;i++){
    ctx.save();ctx.rotate(i*Math.PI/4+t*(b.finalStand?-.2:.1));
    polygon([[-13,-76],[-24,-118],[0,-153],[24,-118],[13,-76]],'#5b4a3b','#e9c499',2.5);
    line(0,-89,0,-128,'#f1d7ad',4);ctx.restore();
   }
   circle(0,0,72,'#383830','#eaca9a',4);circle(0,0,57,'#716049','#ddaf7c',3);
   for(let i=0;i<3;i++){ctx.beginPath();const angle=t*.35+i*Math.PI*2/3;ctx.arc(0,0,86,angle,angle+1.3);ctx.strokeStyle='#f4ddaf';ctx.lineWidth=3;ctx.stroke();}
   polygon([[0,-45],[38,-22],[38,22],[0,45],[-38,22],[-38,-22]],b.coreExposed?'#f5e8c1':'#b58c61',b.coreExposed?'#fff1ca':'#d4af85',3);
  }
  circle(0,0,9+Math.sin(t*3)*1.5,'#e2a67e');
  if(b.phaseShield>0){
   const fraction=Math.min(1,b.phaseShield/BOSS_PHASE_SHIELD_DURATION),radius=stage>=10?168:146;
   ctx.save();ctx.scale(1,stage>=10?1:.72);
   circle(0,0,radius,'#edc39720','#f2d0a4',3);
   circle(0,0,radius-7,null,'#e8b98780',1.5);
   ctx.beginPath();ctx.arc(0,0,radius+6,-Math.PI/2,-Math.PI/2+Math.PI*2*fraction);
   ctx.strokeStyle='#fff0d0';ctx.lineWidth=4;ctx.stroke();
   ctx.restore();
  }
  ctx.restore();
 }
 function hazard(h,t){
  if(h.delay>0)return;
  if(reducedMotion)t=0;
  const warning=h.warning>0;
  const rect=r=>{
   ctx.fillStyle=warning?'#d2a25b20':'#d5755566';ctx.fillRect(r.x,r.y,r.w,r.h);
   ctx.strokeStyle=warning?'#d9b477':'#efaa86';ctx.lineWidth=warning?2:3;ctx.setLineDash(warning?[12,9]:[]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.setLineDash([]);
   if(!warning){ctx.globalAlpha=.22;for(let x=r.x+9;x<r.x+r.w;x+=22)line(x,r.y,x,r.y+r.h,'#ffe7c5',4);ctx.globalAlpha=1;}
  };
  ctx.save();
  if(h.type==='sweepLaser'){
   const ray=(y1,y2)=>{
    if(y2<=y1)return;
    ctx.setLineDash(warning?[13,10]:[]);
    line(h.x,y1,h.x,y2,warning?'#e9c28d88':'#df9a73',warning?3:h.width);
    ctx.setLineDash([]);
    if(!warning)line(h.x,y1,h.x,y2,'#fff0cd',3);
   };
   ray(h.y,h.gapY);ray(h.gapY+h.gapHeight,h.endY);
   line(h.x-32,h.gapY+8,h.x+32,h.gapY+8,'#c3d8ba',2);
   line(h.x-32,h.gapY+h.gapHeight-8,h.x+32,h.gapY+h.gapHeight-8,'#c3d8ba',2);
   label(h.vx>0?'→':'←',h.x,h.gapY+h.gapHeight/2+5,20,'#deebcf','center');
  }else if(h.type==='rotor'){
   circle(h.x,h.y,h.innerRadius,'#b7cfb515','#b7cfb588',2);
   ctx.lineCap='round';
   for(const beam of rotorSegments(h)){
    ctx.setLineDash(warning?[14,10]:[]);
    line(beam.x,beam.y,beam.endX,beam.endY,warning?'#e6b775aa':'#de9671',warning?3:h.width);
    ctx.setLineDash([]);
    if(!warning)line(beam.x,beam.y,beam.endX,beam.endY,'#ffe9c7',3);
   }
   circle(h.x,h.y,20,'#514534','#e8c18b',2);
   label(h.rotation>0?'↻':'↺',h.x,h.y+7,23,'#ead7ad','center');
  }else if(h.type==='homingOrb'){
   const continuous=h.continuous||h.color==='purple';
   const tint=continuous?{edge:'#d6a4ed',flame:'#a568c5',body:'#60416f',core:'#ba82d6',light:'#fae6ff'}:{edge:'#efb580',flame:'#ca8155',body:'#754a32',core:'#e4a06a',light:'#fff0cb'};
   const r=h.r,flicker=reducedMotion?0:Math.sin(t*17+h.x*.03)*.12;
   ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.angle||0);ctx.lineJoin='round';
   const points=shape=>shape.map(([x,y])=>[x*r,y*r]);
   // The dark solid head marks the hit area; unframed flames flow through it.
   // Leave the rear edge open visually so this cannot read as a loot badge.
   const head=points([[1,0],[.7,.52],[.24,.97],[-.21,.75],[-.45,.89],[-.79,.37],[-1,0],[-.85,-.37],[-.55,-.8],[-.24,-.71],[.13,-.99],[.65,-.56]]);
   const flame=points([[.94,0],[.38,-.3],[-.2,-.51],[-.79,-.23],[-1.77-flicker,-.32],[-1.42,-.01],[-2.5+flicker,.31],[-.92,.25],[-.3,.52],[.26,.36],[.7,.3]]);
   const heart=points([[.85,0],[.19,-.17],[-.43,-.2],[-.2,-.03],[-1.65-flicker,.16],[-.51,.15],[-.12,.3],[.34,.18]]);
   if(warning){
    ctx.globalAlpha=.42+(reducedMotion?0:.18*Math.sin(t*14));
    polygon(head,tint.body);
    polygon(flame,tint.flame);
    polygon(heart,tint.edge);
    for(const x of [1.25,1.65]){
     line((x-.18)*r,-r*.23,x*r,0,tint.edge,2);
     line(x*r,0,(x-.18)*r,r*.23,tint.edge,2);
    }
    ctx.globalAlpha=1;
   }else{
    // Translucent trailing fire shows direction without masking nearby bullets.
    polygon(points([[-.45,-.78],[-1.6,-.95],[-1.28,-.43],[-3.25-flicker,.06],[-1.42,.38],[-2.05-flicker,.86],[-.51,.77]]),tint.flame+'55');
    polygon(points([[-.58,-.51],[-2.3-flicker,-.57],[-1.28,-.05],[-2.7+flicker,.2],[-.58,.51]]),tint.flame+'bb');
    polygon(head,tint.body);
    polygon(flame,tint.core);
    polygon(heart,tint.light);
    // Short slashes light the leading horns, never an all-around border.
    line(.16*r,-.89*r,.63*r,-.53*r,tint.edge,2.5);
    line(.3*r,.84*r,.64*r,.48*r,tint.edge,2.5);
    line(-1.25*r,-.51*r,-1.81*r,-.65*r,tint.edge+'aa',1.5);
   }
   ctx.restore();
  }else if(h.type==='weakpoints'){
   for(const node of h.nodes){
    if(node.touched){circle(node.x,node.y,node.r*.55,'#30463955','#8fa68d77',1.5);label('✓',node.x,node.y+5,17,'#bdcfa6','center');continue;}
    circle(node.x,node.y,node.r+9,'#b4d4b516');
    ctx.setLineDash(warning?[7,6]:[]);circle(node.x,node.y,node.r,'#283f38dd','#c7e6c2',3);ctx.setLineDash([]);
    circle(node.x,node.y,node.r-8,null,'#a3c8b28a',1.5);
    label('Touch',node.x,node.y+5,12,'#e6f0d8','center',600);
   }
  }else if(h.type==='cross'){
   for(let i=0;i<4;i++){const a=h.angle+i*Math.PI/2,x=h.x+Math.cos(a)*h.length,y=h.y+Math.sin(a)*h.length;
    ctx.setLineDash(warning?[14,10]:[]);line(h.x,h.y,x,y,warning?'#e0b47788':'#dd8e67',warning?3:h.width);ctx.setLineDash([]);
    if(!warning)line(h.x,h.y,x,y,'#ffe0be',3);
   }circle(h.x,h.y,22,'#49372b','#e0b477',3);
  }else if(h.type==='field'){
   for(const r of h.rects)if(r.w>0&&r.h>0)rect(r);
   ctx.strokeStyle='#d6e3e9';ctx.lineWidth=2;ctx.setLineDash([7,8]);ctx.strokeRect(h.safe.x+8,h.safe.y+8,h.safe.w-16,h.safe.h-16);ctx.setLineDash([]);
   label('↔',h.safe.x+h.safe.w/2,Math.max(145,h.safe.y+32),15,'#e3edf2','center',600);
  }else if(h.type==='meteor'){
   ctx.translate(h.x,h.y);circle(0,0,h.r,'#574438','#c28c64',3);
   for(const [x,y,r] of [[-.3,-.2,.2],[.3,.3,.25],[.15,-.5,.15],[-.4,.4,.1]])circle(x*h.r,y*h.r,r*h.r,'#3d342f','#80604b',2);
   line(-.5*h.r,-.6*h.r,-.35*h.r,-.25*h.r,'#b58560',3);
  }else if(h.type==='gate'){
   rect({x:0,y:h.y,w:h.gapX,h:h.h});rect({x:h.gapX+h.gapWidth,y:h.y,w:720-h.gapX-h.gapWidth,h:h.h});
   if(warning){line(h.gapX+15,h.y+25,h.gapX+h.gapWidth-15,h.y+25,'#d7e1e7',2);label('↔',h.gapX+h.gapWidth/2,h.y+49,13,'#e0e8ed','center');}
  }else if(h.type==='charge' && warning){
   ctx.lineCap='round';line(h.x,h.y,h.endX,h.endY,'#d9925a28',h.width);ctx.setLineDash([15,10]);line(h.x,h.y,h.endX,h.endY,'#efb67c',3);ctx.setLineDash([]);circle(h.endX,h.endY,h.width/2,null,'#efb67c',2);
  }
  if(warning&&!warningSignDrawn){
   label('⚠',610,155,32,'#ebc492','center',600);
   warningSignDrawn=true;
  }
  ctx.restore();
 }
 const bossDestruction=wreck=>drawBossDestruction(ctx,wreck,flagship,reducedMotion);
 return {aircraft,flagship,bossDestruction,hazard,pickup,background,shield};
}
