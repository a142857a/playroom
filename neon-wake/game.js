import { Game, CONFIG, BOOSTS, createRunId } from './simulation.js';
import { AudioEngine } from './audio.js';
import { LEVELS, SYSTEM_KEYS, FORMS, FORM_KEYS, SAVE_KEY, loadProfile, loadedInterruptedAttempt, saveProfile, settleRun, retainForm, getStageCheckpoint, beginAttempt, resetProfile } from './campaign.js';
import { Hangar } from './hangar.js';
import { createArtwork, backgroundPace, onBackgroundLoad } from './art.js';
import { createDrawingTools } from './drawing.js';
import {systemStatLines} from './weapon-display.js';
import {t,getLanguage,setLanguage,translateDocument} from './i18n.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = CONFIG.width, H = CONFIG.height;
const MAX_CANVAS_PIXELS = 10_000_000;
let storage, storageAccessFailed=false;
try { storage = window.localStorage; } catch { storageAccessFailed=true; }
let profile = loadProfile(storage);
const skipStartupSave=loadedInterruptedAttempt(profile);
const game = new Game();
game.reset({ stageId: profile.lastStage, ...getStageCheckpoint(profile,profile.lastStage),form:profile.form });
game.state = 'ready';
game.events.length = 0;
const audio = new AudioEngine();
const $ = id => document.getElementById(id);
const setHudText=(id,value)=>{const node=$(id);if(node.textContent!==value)node.textContent=value;};
const setHudAttribute=(id,name,value)=>{const node=$(id);if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
const keys = new Set();
const FLIGHT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyP', 'Escape', 'KeyR', 'KeyM']);
const FORM_SHORTCUTS = { Digit1: 'primary', Digit2: 'missiles', Digit3: 'laser', Numpad1: 'primary', Numpad2: 'missiles', Numpad3: 'laser' };
const pointer = { active: false, target: null, id: null, touch: false, lastX: 0, lastY: 0 };
const colors = { coral: '#ec9373', gold: '#e1b262', violet: '#dc8c67' };
const enemyFills = { scout:'#564239',dart:'#633d31',turret:'#575042',weaver:'#514337',sniper:'#523638',mine:'#625138',interceptor:'#593f33',splitter:'#554c3d',bomber:'#574c3e',bulwark:'#5d4937',lancer:'#553c37',seeker:'#584039',pursuer:'#60503e' };
const shapes = createDrawingTools(ctx, { translate: t });
const { polygon, line, circle, label } = shapes;
const artwork = createArtwork(ctx, shapes);
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let touchFocus = false, lastState = '', lastHud = 0, lastStatsKey = '';
let previous = performance.now(), accumulator = 0, visualTime = 0;
let departure = null;
let pausedCanvasRendered=false;
onBackgroundLoad(()=>{pausedCanvasRendered=false;});
const redrawForMotionPreference=()=>{pausedCanvasRendered=false;};
if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',redrawForMotionPreference);
else reducedMotion.addListener?.(redrawForMotionPreference);
let soundEnabled = true, fullscreenUnavailable = false;
let hangar, settlement = null, saveSucceeded = true;
let readyStageExplicit = false, readyFormExplicit = false;
try {
  soundEnabled = localStorage.getItem('neon-wake-sound') !== 'off';
} catch { /* Local records are optional in private browsing. */ }
audio.setEnabled(soundEnabled);


function fitCanvas() {
  const bounds=canvas.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0)return;
  // Fullscreen on a high-DPI display can otherwise allocate a 30M+ pixel
  // backing store. Raster work dominates frame time long before JS drawing does.
  const ratio = Math.min(Math.max(1,window.devicePixelRatio||1),3,
    Math.sqrt(MAX_CANVAS_PIXELS/(bounds.width*bounds.height)));
  const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
  // Match the actual display size, including large fullscreen layouts. Changing
  // the backing store only when necessary avoids clearing it on observer loops.
  if(canvas.width!==width||canvas.height!==height){
    canvas.width=width;canvas.height=height;
    ctx.setTransform(width/W,0,0,height/H,0,0);
    pausedCanvasRendered=false;
  }
}
let canvasResizePending=false;
function scheduleCanvasFit(){
  if(canvasResizePending)return;
  canvasResizePending=true;
  requestAnimationFrame(()=>{canvasResizePending=false;fitCanvas();});
}
fitCanvas();
window.addEventListener('resize',()=>{
  scheduleCanvasFit();
  if(game.state==='playing'||document.activeElement===$('launchBtn'))requestAnimationFrame(revealFlight);
  if($('resetDialog').open&&!$('resetError').hidden)requestAnimationFrame(()=>$('resetError').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
});
const canvasResizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(scheduleCanvasFit);
canvasResizeObserver?.observe(canvas);

function drawPickupLegend() {
  for (const sample of document.querySelectorAll('canvas[data-pickup]')) {
    const preview = sample.getContext('2d');
    const shapes = createDrawingTools(preview, { translate: t, roundedPolygons: false });
    preview.clearRect(0,0,sample.width,sample.height);
    createArtwork(preview,shapes).pickup({x:48,y:48,type:sample.dataset.pickup,amount:Number(sample.dataset.amount)||1,boost:sample.dataset.boost},0);
  }
}

function background(t) { artwork.background(t,game.stageId,game.player,backgroundPace(game)); }

function drawPlayer(p,t) {
 const finale=game.finale,ultimate=finale?.ultimate;
 const transformation=ultimate&&finale.transformProgress<1?{from:game.form,to:'trinity',progress:finale.transformProgress}:game.transform;
 artwork.aircraft(p,t,ultimate?'trinity':game.form,transformation);
}

function updateDeparture(){
  if(game.state!=='victory'){departure=null;return;}
  if(!departure){
    departure={start:visualTime,x:game.player.x,y:game.player.y,duration:reducedMotion.matches ? .55 : 1.55,complete:false};
    clearInput();
  }
  if(visualTime-departure.start>=departure.duration)departure.complete=true;
}

function drawDeparture(time){
  const elapsed=Math.max(0,time-departure.start),progress=Math.min(1,elapsed/departure.duration);
  const charge=Math.min(1,progress/.34),lift=Math.max(0,(progress-.34)/.66);
  const climb=lift*lift*(3-2*lift),y=departure.y-(departure.y+125)*climb;
  const p={...game.player,x:departure.x,y,roll:0};
  ctx.save();
  if(!reducedMotion.matches){
    ctx.globalAlpha=.35*(1-charge);
    circle(p.x,p.y,20+charge*75,null,'#e5f5ec',3);
    ctx.globalAlpha=.65;
    for(const offset of [-17,-8,0,8,17]){
      const length=25+charge*45+lift*95-Math.abs(offset);
      line(p.x+offset,p.y+27,p.x+offset*.7,p.y+27+length,'#b8edec',Math.abs(offset)<10?3:1.5);
    }
  }
  ctx.globalAlpha=1;
  if(y>-100)drawPlayer(p,time);
  ctx.restore();
}

function drawHitCore(p) {
  if (p.hp <= 0) return;
  // The light-blue disk matches the collision radius; the dark backing and white
  // locator ring remain visible even while the ship flashes after damage.
  circle(p.x, p.y, 11, '#050b15');
  circle(p.x, p.y, 8.5, null, '#eefaff', 1.5);
  circle(p.x, p.y, p.r, '#8edfff');
  circle(p.x - 1, p.y - 1.5, 1.4, '#effbff');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    line(p.x + dx * 13, p.y + dy * 13, p.x + dx * 19, p.y + dy * 19, '#d8f5ff', 1.2);
  }

}

function drawEnemy(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const fill = e.hurt > 0 ? '#fff0d5' : enemyFills[e.type] || '#64452e';
  const edge = e.type === 'weaver' ? colors.violet : e.type === 'turret' ? colors.gold : colors.coral;
  if(e.elite){
    if(e.type==='ace'){
      polygon([[0,-38],[15,-4],[47,26],[16,18],[0,36],[-16,18],[-47,26],[-15,-4]],fill,'#e0b775',2.5);
      for(const x of [-18,18]){line(x,4,x*1.65,14,'#efd5a5',4);line(x,12,x*1.65,22,'#efd5a5',3);}
    }else if(e.type==='siege'){
      polygon([[-40,-35],[40,-35],[47,30],[0,44],[-47,30]],fill,'#dba66d',2.5);
      for(const x of [-27,27]){polygon([[x-10,-28],[x+10,-28],[x+8,40],[x-8,40]],'#322c28','#e6bd89',2);line(x,-15,x,36,'#e7b475',5);}
    }else{
      polygon([[-50,-20],[-28,-43],[28,-43],[50,-20],[50,21],[25,43],[-25,43],[-50,21]],fill,'#e0b775',3);
      for(const x of [-29,29])for(const y of [-20,20])circle(x,y,9,'#342a26','#dfaa76',2);
      circle(0,0,22,'#352c29','#e7bd88',3);
    }
    label('Elite',0,-51,13,'#f0d4a4','center',700);
  } else if (e.type === 'seeker') {
    // A hooked prow and single violet launcher mark the persistent pursuer.
    polygon([[0,38],[12,12],[33,-13],[23,-29],[10,-13],[0,-27],[-10,-13],[-23,-29],[-33,-13],[-12,12]],fill,'#d39a82',2);
    for(const side of [-1,1]){
      polygon([[side*13,-12],[side*24,-21],[side*25,-10],[side*11,8]],'#796052','#cda48b',1.2);
      line(side*21,-21,side*17,-28,'#e4b997',3);
    }
    polygon([[-8,-7],[0,-16],[8,-7],[7,18],[0,31],[-7,18]],'#372c42','#ba88d1',2);
    line(0,-5,0,20,'#e1b1f0',4);
    polygon([[-5,18],[0,27],[5,18]],'#f3cef9');
  } else if (e.type === 'pursuer') {
    // Two forward missile racks distinguish its paired, shorter pursuit shots.
    polygon([[-37,-22],[-20,-35],[-9,-11],[9,-11],[20,-35],[37,-22],[34,23],[19,35],[9,13],[-9,13],[-19,35],[-34,23]],fill,'#d9b184',2);
    for(const x of [-24,24]){
      polygon([[x-8,-17],[x+8,-17],[x+9,19],[x,32],[x-9,19]],'#3c3029','#dc9a5d',2);
      polygon([[x-4,8],[x-4,19],[x,26],[x+4,19],[x+4,8]],'#f0bd76');
      line(x,-10,x,1,'#a97147',4);
      line(x-5,-24,x+5,-24,'#ecd0a4',3);
    }
    polygon([[-9,-9],[9,-9],[12,9],[0,18],[-12,9]],'#8a6950','#e2bb8d',1.5);
    line(-4,0,4,0,'#f3d6a4',3);
  } else if (e.type === 'lancer') {
    polygon([[-38, -28], [-16, -36], [0, -20], [16, -36], [38, -28], [31, 32], [13, 20], [0, 40], [-13, 20], [-31, 32]], fill, '#cd8b84', 2);
    for (const x of [-23, 23]) {
      polygon([[x - 8, -18], [x + 8, -18], [x + 6, 27], [x - 6, 27]], '#422039', '#d3b8b1');
      line(x, -10, x, 24, '#cd8b84', 4);
    }
    circle(0, 4, 12, '#171d2a', '#d2a27d', 2);
    circle(0, 4, 6, '#cd8b84');
  } else if (e.type === 'sniper') {
    if ((e.windup > 0 || e.stream > 0) && Number.isFinite(e.aimAngle)) {
      ctx.save(); ctx.setLineDash([12, 12]);
      line(0, 18, Math.cos(e.aimAngle) * 1300, Math.sin(e.aimAngle) * 1300, '#ff737a88', 2);
      ctx.restore();
    }
    polygon([[0, 35], [14, -12], [8, -30], [-8, -30], [-14, -12]], fill, '#d49b72', 2);
    line(0, 4, 0, 37, '#fff0cf', 3);
    polygon([[-20, -15], [-9, -7], [-9, 10], [-20, 15]], '#32232e', '#d49b72');
    polygon([[20, -15], [9, -7], [9, 10], [20, 15]], '#32232e', '#d49b72');
  } else if (e.type === 'mine') {
    ctx.rotate(e.age * 0.65);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      line(Math.cos(a) * 16, Math.sin(a) * 16, Math.cos(a) * 28, Math.sin(a) * 28, '#cbb88e', 3);
    }
    circle(0, 0, 18, fill, '#cbb88e', 2);
    circle(0, 0, 7 + Math.sin(e.age * 8) * 2, '#cbb88e');
  } else if (e.type === 'interceptor') {
    polygon([[0, 32], [11, 4], [35, -22], [12, -10], [0, -24], [-12, -10], [-35, -22], [-11, 4]], fill, '#c6a688', 2);
    line(0, -9, 0, 21, '#ffecc0', 3);
    line(-16, -9, -23, -30, '#c6a68855', 3); line(16, -9, 23, -30, '#c6a68855', 3);
  } else if (e.type === 'splitter') {
    for (const x of [-14, 14]) polygon([[x, 28], [x + 14, -5], [x, -23], [x - 14, -5]], fill, '#c99e83', 2);
    line(-7, 0, 7, 0, '#e6c9ac', 4);
    circle(-14, 0, 5, '#c99e83'); circle(14, 0, 5, '#c99e83');
  } else if (e.type === 'bomber') {
    polygon([[-37, -21], [37, -21], [45, 11], [23, 32], [0, 21], [-23, 32], [-45, 11]], fill, '#ffd291', 2);
    for (const x of [-26, 0, 26]) {
      circle(x, 3, 10, '#19242c', '#ffd291', 2);
      circle(x, 3, 4, '#ffd291');
    }
  } else if (e.type === 'bulwark') {
    polygon([[-32, -24], [32, -24], [34, 24], [0, 38], [-34, 24]], '#38404a', '#d5cfad', 2);
    polygon([[-20, -13], [20, -13], [18, 15], [0, 25], [-18, 15]], fill, '#ffca7e');
    ctx.beginPath(); ctx.arc(0, -4, 46, 0.15, Math.PI - 0.15);
    ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 5; ctx.stroke();
    line(-12, 3, 12, 3, '#ffe0a0', 3);
  } else if (e.type === 'turret') {
    polygon([[-23, -21], [23, -21], [32, -6], [25, 20], [12, 29], [-12, 29], [-25, 20], [-32, -6]], fill, edge);
    polygon([[-35, -8], [-24, -14], [-24, 19], [-35, 12]], '#1c2730', edge);
    polygon([[35, -8], [24, -14], [24, 19], [35, 12]], '#1c2730', edge);
    circle(0, 3, 12, '#17232c', edge);
    line(0, 6, 0, 24, edge, 4);
  } else if (e.type === 'weaver') {
    polygon([[0, 29], [32, -5], [14, -18], [0, -8], [-14, -18], [-32, -5]], fill, edge);
    polygon([[0, 17], [9, -4], [0, -15], [-9, -4]], '#bca28c');
    line(-22, -7, -10, 5, edge); line(22, -7, 10, 5, edge);
  } else if (e.type === 'dart') {
    polygon([[0, 25], [17, -18], [0, -10], [-17, -18]], fill, edge);
    polygon([[0, 13], [5, -7], [-5, -7]], '#ffb293');
    line(0, -14, 0, -30, '#ff916d55', 3);
  } else {
    polygon([[0, 24], [12, 4], [25, -12], [12, -18], [0, -6], [-12, -18], [-25, -12], [-12, 4]], fill, edge);
    polygon([[0, 15], [6, 2], [0, -4], [-6, 2]], '#ffb79b');
    line(-12, -20, -12, -29, '#ff916d55', 2); line(12, -20, 12, -29, '#ff916d55', 2);
  }
  if (e.fire < 0.3 && e.y < 625 && e.type !== 'dart') {
    const charge = Math.max(0, 1 - e.fire / 0.3);
    circle(0, 20, 4 + charge * 7, `${edge}35`, edge);
  }
  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#ffffff15'; ctx.fillRect(-20, -34, 40, 3);
    ctx.fillStyle = edge; ctx.fillRect(-20, -34, 40 * Math.max(0, e.hp / e.maxHp), 3);
  }
  ctx.restore();
}

function drawBoss(b,time) {
  artwork.flagship(b,time,b.patternId||game.stageId);
  // Keep the boss readout distinct from the player's separate hull badge.
  const x=120,y=10,width=480,height=84;
  ctx.save();
  ctx.shadowColor='#080d12aa';ctx.shadowBlur=16;ctx.shadowOffsetY=4;
  ctx.beginPath();ctx.roundRect(x,y,width,height,10);
  ctx.fillStyle='#131b21eb';ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.strokeStyle='#aa8c6c99';ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle='#d9a678';ctx.fillRect(x+16,y+17,3,25);
  label(b.name,x+28,y+36,30,'#efd1aa','left',650);
  const status=b.finalStand&&b.coreLock?t('Touch all nodes · {count}/{total}',{count:b.coreLock.nodes.filter(n=>n.touched).length,total:b.coreLock.nodes.length}):b.coreExposed?t('Core exposed'):b.coreLock?t('Touch both nodes · {count}/2',{count:b.coreLock.nodes.filter(n=>n.touched).length}):b.phaseShield>0?t('Phase shield'):b.coreOpen>0?t('Core exposed · {seconds}s',{seconds:Math.ceil(b.coreOpen)}):t('Phase {phase} / {count}',{phase:b.phase,count:b.phaseCount});
  label(status,x+28,y+64,25,b.coreLock||b.coreExposed||b.coreOpen>0?'#c7e6c2':'#c1ad94','left');
  ctx.fillStyle='#49382d';ctx.fillRect(x+28,y+73,width-56,5);
  ctx.fillStyle='#dfaa78';ctx.fillRect(x+28,y+73,(width-56)*Math.max(0,b.hp/b.maxHp),5);
  ctx.restore();
}

function drawGame(time) {
  background(time);
  ctx.save();
  if (!reducedMotion.matches && game.shake > 0 && game.state === 'playing') ctx.translate(Math.sin(time * 157) * game.shake * 12, Math.cos(time * 123) * game.shake * 9);

  if (game.state === 'ready') {
    ctx.globalAlpha = 0.42;
    for (let i = 0; i < 3; i++) drawEnemy({ x: 225 + i * 135, y: 215 + (i % 2) * 40 + (reducedMotion.matches ? 0 : Math.sin(time + i) * 8), type: i === 1 ? 'turret' : 'scout', fire: 1, hp: 100, maxHp: 100 });
    ctx.globalAlpha = 1;
  }

  for(const h of game.hazards)artwork.hazard(h,time);
  for(const item of game.pickups)artwork.pickup(item,time);

  for (const s of game.shots) {
    const speed=Math.hypot(s.vx,s.vy)||1,ux=s.vx/speed,uy=s.vy/speed;
    line(s.x-ux*20,s.y-uy*20,s.x+ux*8,s.y+uy*8,'#a2cbbd',3);line(s.x-ux*12,s.y-uy*12,s.x+ux*8,s.y+uy*8,'#ecf1de',1.5);
  }
  for (const m of game.missiles) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle + Math.PI / 2);
    polygon([[-3, 7], [0, 22 + Math.sin(time * 55) * 5], [3, 7]], '#a2cbbdaa');
    polygon([[0, -11], [5, 1], [5, 10], [0, 7], [-5, 10], [-5, 1]], '#ecf1de', '#a2cbbd');
    ctx.restore();
  }
  for (const e of game.enemies) drawEnemy(e);
  if (game.boss) drawBoss(game.boss, time);
  for(const wreck of game.bossDestructions)artwork.bossDestruction(wreck);
  for (const beam of game.hostileLasers) {
    const endX = beam.x + Math.cos(beam.angle) * beam.length;
    const endY = beam.y + Math.sin(beam.angle) * beam.length;
    if (beam.warning > 0) {
      ctx.save(); ctx.setLineDash([13, 10]);
      line(beam.x, beam.y, endX, endY, '#ffce8eba', 2);
      ctx.setLineDash([]);
      circle(beam.x, beam.y, 13 + Math.sin(time * 22) * 3, '#ff976622', '#ffd8a0', 2);
      label('⚠', beam.x, beam.y - 25, 10, '#ffd8a0', 'center', 700);
      ctx.restore();
    } else {
      line(beam.x, beam.y, endX, endY, '#e38f7025', beam.width * 2.4);
      line(beam.x, beam.y, endX, endY, '#dd8b7b', beam.width);
      line(beam.x, beam.y, endX, endY, '#ffe4c8', beam.width * 0.38);
      circle(beam.x, beam.y, beam.width, '#ffe4c8');
    }
  }
  if (game.beam) {
    const beam=game.beam,ex=beam.x+Math.cos(beam.angle)*beam.length,ey=beam.y+Math.sin(beam.angle)*beam.length;
    ctx.save();ctx.lineCap='round';
    if(beam.path){
      ctx.beginPath();ctx.moveTo(beam.path[0].x,beam.path[0].y);
      for(let i=1;i<beam.path.length;i++)ctx.lineTo(beam.path[i].x,beam.path[i].y);
      for(const [color,width] of [['#a2cbbd24',beam.width*1.8],['#a2cbbd99',beam.width],['#edf1df',Math.max(2,beam.width*.22)]]){
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
      }
    }else{
      line(beam.x,beam.y,ex,ey,'#a2cbbd24',beam.width*1.8);
      line(beam.x,beam.y,ex,ey,'#a2cbbd99',beam.width);
      line(beam.x,beam.y,ex,ey,'#edf1df',Math.max(2,beam.width*.22));
    }
    circle(beam.x,beam.y,beam.width*.65,'#bddbca88');ctx.restore();
  }
  if(game.state==='victory'&&departure)drawDeparture(time);
  else{
    artwork.shield(game.player,game.systems.shield,time);
    if(game.boosts.invincible>0){circle(game.player.x,game.player.y,36,null,'#d3edff',3);circle(game.player.x,game.player.y,40,null,'#a2cbbd77',1);}
    drawPlayer(game.player, time);
  }

  for (const b of game.bullets) {
    const color = colors[b.color] || colors.coral;
    circle(b.x, b.y, b.r + 4, `${color}20`);
    circle(b.x, b.y, b.r, '#19212b', color, 2);
    circle(b.x, b.y, b.r * 0.48, b.color === 'gold' ? '#fff3bf' : color);
  }

  for (const r of game.rings) {
    const progress = 1 - r.life / r.maxLife;
    ctx.globalAlpha = (1 - progress) * 0.75;
    circle(r.x, r.y, Math.max(1, r.max * (1 - (1 - progress) ** 2)), null, r.color, 2 * (1 - progress) + 1);
  }
  for (const p of game.particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  if(game.state!=='victory'||!departure)drawHitCore(game.player);
  if(game.state==='playing'||game.state==='paused'){
    const p=game.player,hp=Math.max(0,p.hp/p.maxHp),barY=p.y>H-100?p.y-62:p.y+48;
    const tint=hp<=.3?'#f2a28c':hp<=.6?'#efd294':'#c4dfbb';
    ctx.fillStyle='#101c1bf0';ctx.fillRect(p.x-34,barY-3,68,12);
    ctx.strokeStyle=tint;ctx.lineWidth=1;ctx.strokeRect(p.x-34,barY-3,68,12);
    ctx.fillStyle='#4b4f47';ctx.fillRect(p.x-30,barY,60,6);
    ctx.fillStyle=tint;ctx.fillRect(p.x-30,barY,60*hp,6);
  }
  ctx.restore();

  const activeBoosts=Object.entries(game.boosts).filter(([,time])=>time>0).map(([key,time])=>t(BOOSTS[key].label)+' '+t('{seconds}s',{seconds:Math.ceil(time)}));
  if(activeBoosts.length){ctx.fillStyle='#182d40df';ctx.fillRect(150,H-76,W-300,26);label(activeBoosts.join('     '),W/2,H-57,14,'#d2ebfc','center',600);}

  if (game.banner && game.state === 'playing') {
    const alpha = Math.min(1, game.banner.life * 2, (3.6 - game.banner.life) * 3 + 0.3);
    ctx.globalAlpha = Math.max(0, alpha);
    const y = game.boss ? 300 : 265;
    const strip = ctx.createLinearGradient(100, 0, W - 100, 0);
    strip.addColorStop(0, '#08151e00'); strip.addColorStop(0.2, '#08151ee6'); strip.addColorStop(0.8, '#08151ee6'); strip.addColorStop(1, '#08151e00');
    ctx.fillStyle = strip; ctx.fillRect(100, y - 30, W - 200, game.banner.sub?75:48);
    label(game.banner.title, W / 2, y, 23, '#e7e9d9', 'center', 600);
    label(game.banner.sub, W / 2, y + 27, 14, '#96adb4', 'center');
    ctx.globalAlpha = 1;
  }
  if (!reducedMotion.matches && game.flash > 0 && game.state === 'playing') {
    ctx.fillStyle = `rgba(157, 239, 221, ${game.flash * 0.35})`; ctx.fillRect(0, 0, W, H);
  }
}

function updateHud() {
  updateDeparture();
  audio.updateMusic(game.stageId,game.state==='playing');
  if(game.state==='gameover'||game.state==='victory')settleCurrentRun();
  const progress=game.state==='victory'?100:Math.min(99,Math.round(game.progress*100));
  if($('levelProgress').value!==progress)$('levelProgress').value=progress;
  setHudText('levelProgress',progress+'%');setHudAttribute('levelProgress','aria-valuenow',String(progress));
  setHudText('progressValue',(game.boss?t('Boss')+' ':game.routeBlocked?t('Elite')+' ':'')+progress+'%');
  setHudText('hpValue',`${Math.ceil(game.player.hp)} / ${game.player.maxHp}`);
  canvas.closest('.game-frame').classList.toggle('has-boss',!!game.boss);
  if($('hpBar').value!==game.player.hp)$('hpBar').value=game.player.hp;
  if($('hpBar').max!==game.player.maxHp)$('hpBar').max=game.player.maxHp;
  setHudText('hpBar',`${Math.round(game.player.hp / game.player.maxHp * 100)}%`);
  setHudAttribute('hpBar','aria-valuenow',String(game.player.hp));
  setHudAttribute('hpBar','aria-valuetext',t('{hp} of {max} hit points',{hp:Math.ceil(game.player.hp),max:game.player.maxHp}));
  $('hullReadout').classList.toggle('is-low', game.player.hp <= 30);
  setHudText('pulseCount',`${game.pulses}/${CONFIG.maxPulses}`);
  setHudText('playPulseCount',`${game.pulses}/${CONFIG.maxPulses}`);
  setHudAttribute('playPulseBadge','aria-label',t('Pulse: {count} of {max}',{count:game.pulses,max:CONFIG.maxPulses}));
  $('pulseBtn').classList.toggle('has-pulses',game.pulses>0);
  for(const [index,pip] of [...$('pulsePips').children].entries())pip.classList.toggle('is-filled',index<game.pulses);
  $('pulseBtn').disabled = game.state !== 'playing' || game.pulses === 0;
  $('touchPauseBtn').disabled = !['playing','paused'].includes(game.state);
  const pauseLabel=t(game.state==='paused'?'Resume':'Pause');
  setHudText('touchPauseBtn',pauseLabel);
  setHudAttribute('touchPauseBtn','aria-label',pauseLabel);
  setHudAttribute('pulseBtn','aria-label',t('Pulse: {count} of {max}',{count:game.pulses,max:CONFIG.maxPulses}));
  $('focusBtn').disabled = game.state !== 'playing';
  setHudText('statusValue',t({ ready: 'Standing by', playing: game.bossDefeated ? 'Sector secured' : game.boss?.midboss ? 'Mid-boss engaged' : game.approachComplete ? 'Commander engaged' : 'In flight', paused: 'Paused', gameover: 'Signal lost', victory: 'Sector clear' }[game.state]));
  setHudText('soundBtn',t(soundEnabled ? 'Sound on' : 'Sound off'));
  setHudAttribute('soundBtn','aria-pressed',String(soundEnabled));
  const homingBoost=game.boosts.homing>0;
  const statsKey=`${game.rank}/${game.damageMultiplier}/${homingBoost}/${getLanguage()}`;
  if(statsKey!==lastStatsKey){
    for(const key of SYSTEM_KEYS)$('stats-'+key).textContent=systemStatLines(key,game.stats(key),game.damageMultiplier,homingBoost).join(' · ');
    lastStatsKey=statsKey;
  }
  const switching=game.transform,ultimate=!!game.finale?.ultimate;
  setHudText('sharedRank',t('Rank {rank}',{rank:game.rank}));
  const mobileSaveWarning=game.state==='playing'&&!saveSucceeded&&window.innerWidth<=600;
  const formStatusText=mobileSaveWarning?t('Progress not saved'):ultimate?t('Threefold · All weapons'):switching?t('Switching to {form} · {seconds} s',{form:t(FORMS[switching.target].name),seconds:switching.remaining.toFixed(1)}):'';
  setHudText('formStatus',formStatusText);
  $('formStatus').hidden=!formStatusText;
  $('formStatus').classList.toggle('is-save-warning',mobileSaveWarning);
  for(const key of FORM_KEYS){
    const button=$('form-'+key);setHudAttribute('form-'+key,'aria-pressed',String(ultimate||game.form===key));
    button.disabled=ultimate||!['ready','playing'].includes(game.state)||!!switching;
    button.classList.toggle('is-transforming',switching?.target===key);
    button.style.setProperty('--transform-progress',switching?.target===key?`${100*(1-switching.remaining/switching.duration)}%`:'0%');
  }
  syncImmersionControls();
  const shield=game.systems.shield;
  setHudText('shieldStatus',shield.active>0?t('Shield · {blocks} blocks',{blocks:shield.charges}):shield.cooldown>0?t('Shield · {seconds} s',{seconds:shield.cooldown.toFixed(1)}):t('Shield ready'));
  syncFlightSaveWarning();
  const displayState=game.state==='victory'&&departure&&!departure.complete?'departing':game.state;
  if (displayState === lastState) return;
  lastState = displayState;
  $('overlay').hidden = displayState === 'playing'||displayState==='departing';
  canvas.setAttribute('aria-label',t('Skyward Bloom. {status}. Move with arrow keys or WASD. Only the light-blue core can be hit. All weapons are automatic. 1, 2, 3 change form. Shift focus, X pulse, Space pause.',{status:$('statusValue').textContent}));
  if (displayState === 'playing'||displayState==='departing') return;
  if (game.state === 'ready') {
    $('overlayTitle').textContent = t(game.stage.name);
    $('launchBtn').textContent = t('Play');
  } else if (game.state === 'paused') {
    $('overlayTitle').textContent = t('Paused');
    $('launchBtn').textContent = t('Resume');
  } else if (game.state === 'gameover' || game.state === 'victory') {
    const won = game.state === 'victory';
    const finished = won && game.stageId === LEVELS.length;
    $('overlayTitle').textContent = t(won ? 'Clear' : 'Try again');
    $('launchBtn').textContent = t(won && !finished ? 'Next sector' : won ? 'Replay' : 'Retry');
    revealFlight();
    $('launchBtn').focus({preventScroll:true});
  }
}

function recordSaveResult(saved){
  saveSucceeded=saved;
  const warning=$('saveWarning');
  if(warning)warning.hidden=saved;
  syncFlightSaveWarning();
  return saved;
}
function syncFlightSaveWarning(){
  const show=game.state==='playing'&&!saveSucceeded;
  const warning=$('saveWarningFlight'),sector=$('sectorValue');
  if(warning.hidden!==!show)warning.hidden=!show;
  if(sector.hidden!==show)sector.hidden=show;
  $('immersionSaveWarning').hidden=!(show&&document.body.classList.contains('is-immersive'));
}
function saveCampaign(){return recordSaveResult(saveProfile(storage,profile));}

function settleCurrentRun(abandoned = false) {
  if (!abandoned && game.state !== 'victory' && game.state !== 'gameover') return;
  if (settlement || !profile.activeAttempt) return;
  settlement = settleRun(profile, {
    runId: game.runId, stageId: game.stageId, won: game.state === 'victory',
    rank:game.rank, pulses:game.pulses, form:game.form,
    time: game.clearTime || game.time,
  });
  if (settlement) {
    if(!settlement.won){game.rank=profile.rank;game.pulses=profile.pulses;game.rankCollected=0;game.syncSystems();}
    saveCampaign();
    if (game.state === 'victory' && game.stageId < LEVELS.length && hangar) hangar.selectedStage = game.stageId + 1;
    hangar?.render();
  }
}

function syncStageText() {
  $('sectorValue').textContent = `${String(game.stageId).padStart(2, '0')} · ${t(game.stage.name)}`;
}

function previewStage(stageId) {
  if (game.state !== 'ready') return;
  readyStageExplicit = true;
  game.reset({ stageId, ...getStageCheckpoint(profile,stageId),form:profile.form });
  game.state = 'ready'; game.events.length = 0;
  lastState = ''; syncStageText(); updateHud();
}

function refreshReadyProfileFromStorage() {
  // A second tab may finish the run this tab saw as interrupted. Adopt only a
  // settled save while still on the ready screen; a live run is never replaced.
  if (game.state !== 'ready' || profile.activeAttempt || !storage) return false;
  let raw, stored;
  try {
    raw = storage.getItem(SAVE_KEY);
    stored = raw === null ? null : JSON.parse(raw);
  } catch { return false; }
  if (!stored || typeof stored !== 'object' || stored.version !== profile.version || stored.activeAttempt !== null) return false;
  const fresh = loadProfile(storage);
  // If another tab wrote between the two reads, wait for its event or retry on Play.
  try { if (storage.getItem(SAVE_KEY) !== raw) return false; } catch { return false; }
  if (loadedInterruptedAttempt(fresh)) return false;
  const stageId = readyStageExplicit ? hangar.selectedStage : fresh.lastStage;
  const form = readyFormExplicit ? game.form : fresh.form;
  const hadStageFocus = document.activeElement?.closest?.('#stageGrid .stage-card');
  if (readyFormExplicit) retainForm(fresh,form);
  profile = fresh;
  hangar.profile = profile;
  hangar.selectedStage = stageId;
  game.reset({stageId,...getStageCheckpoint(profile,stageId),form});
  game.state = 'ready';game.events.length = 0;
  lastState = '';lastStatsKey = '';
  hangar.render();
  if (hadStageFocus) $('stageGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  syncStageText();recordSaveResult(true);updateHud();
  pausedCanvasRendered = false;
  return true;
}

function revealFlight() {
  if(document.body.classList.contains('is-immersive')||(document.fullscreenElement&&window.innerWidth>=1040))return;
  if(game.state!=='playing'){
    $('launchBtn').scrollIntoView({block:'center',behavior:'auto'});
    return;
  }
  // A short portrait screen may fit the playfield but clip its touch controls;
  // a short landscape screen needs the bottom of the playfield in view too.
  // Use page coordinates so a launch from the Hangar returns to both elements.
  const controls=document.querySelector('.touch-controls');
  const canvasBounds=canvas.closest('.game-frame').getBoundingClientRect();
  const lower=window.scrollY+Math.max(canvasBounds.bottom,controls.getBoundingClientRect().bottom);
  const viewportHeight=window.visualViewport?.height??window.innerHeight;
  // If both cannot fit, show the whole playfield; touch controls remain below
  // it and can still be reached by scrolling.
  const canvasTop=window.scrollY+canvasBounds.top;
  const target=lower-canvasTop>viewportHeight-4?window.scrollY+canvasBounds.bottom:lower;
  window.scrollTo({top:Math.max(0,target-viewportHeight+4),behavior:'auto'});
}

function focusLaunchAfterModal(){
  revealFlight();
  $('launchBtn').focus({preventScroll:true});
}
function focusLaunchAfterModalClose(){
  // Escape may restore focus to the dialog opener after its close event.
  requestAnimationFrame(()=>{
    if(!$('guideDialog').open&&!$('resetDialog').open)focusLaunchAfterModal();
  });
}

function startStage(stageId) {
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > LEVELS.length) return;
  // A settled write can arrive just before its storage event is delivered.
  if (game.state === 'ready' && refreshReadyProfileFromStorage() && !readyStageExplicit) stageId = hangar.selectedStage;
  settleCurrentRun(true);
  game.reset({ stageId, ...getStageCheckpoint(profile,stageId),form:profile.form });
  let attempt=beginAttempt(profile,{runId:game.runId,stageId});
  for(let retry=0;!attempt&&retry<4;retry++){
    game.runId=createRunId();
    attempt=beginAttempt(profile,{runId:game.runId,stageId});
  }
  if(!attempt){
    game.state='ready';game.events.length=0;
    recordSaveResult(false);updateHud();
    return;
  }
  settlement = null; lastState = '';
  clearInput(); accumulator = 0; previous = performance.now();
  audio.unlock();
  hangar.selectedStage = stageId;profile.lastStage=stageId;saveCampaign();hangar.render();
  readyStageExplicit = false;readyFormExplicit = false;
  syncStageText(); updateHud();
  revealFlight();
  canvas.focus({ preventScroll: true });
}

function clearInput() {
  keys.clear(); pointer.active = false; pointer.target = null; pointer.id = null; touchFocus = false;
  $('focusBtn').setAttribute('aria-pressed', 'false');
}

function launch() {
  if(game.state==='victory'&&departure&&!departure.complete)return;
  audio.unlock();
  clearInput();
  if (game.state === 'paused') game.pause();
  else { startStage(game.state === 'victory' && game.stageId < LEVELS.length ? game.stageId + 1 : game.stageId); return; }
  accumulator = 0; previous = performance.now();
  revealFlight();
  canvas.focus({ preventScroll: true });
  updateHud();
}

function pause() {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  game.pause(); clearInput(); accumulator = 0; previous = performance.now();
  if (game.state === 'playing') { audio.unlock(); revealFlight(); canvas.focus({ preventScroll: true }); }
  updateHud();
  if (game.state === 'paused') { revealFlight(); $('launchBtn').focus({ preventScroll: true }); }
}

function restart() { startStage(game.stageId); }

function changeForm(key) {
  if(!game.requestForm(key))return;
  audio.unlock();
  if(game.state==='ready'){
    readyFormExplicit = true;
    retainForm(profile,game.form);
    // Loading an interrupted attempt may mean another tab is still flying.
    // Choosing a ready-screen form must not silently retire that live run.
    if(loadedInterruptedAttempt(profile))recordSaveResult(false);
    else saveCampaign();
  }
  updateHud();
}
function returnFocusToFlight(event) {
  // Pointer controls return to flight. Keyboard focus stays on an enabled
  // button, but moves to the canvas if using it disabled that same button.
  if ((event.detail > 0 || event.currentTarget?.disabled) && game.state === 'playing') {
    revealFlight();
    canvas.focus({ preventScroll: true });
  }
}

function usePulse(event) {
  game.usePulse();
  updateHud();
  if (event) returnFocusToFlight(event);
}

function toggleFocus(event) {
  touchFocus = !touchFocus;
  $('focusBtn').setAttribute('aria-pressed', String(touchFocus));
  updateHud();
  returnFocusToFlight(event);
}

for(const key of FORM_KEYS)$('form-'+key).addEventListener('click',event=>{
  changeForm(key);
  returnFocusToFlight(event);
});

function toggleSound(event) {
  soundEnabled = !soundEnabled;
  audio.setEnabled(soundEnabled); audio.unlock();
  try { localStorage.setItem('neon-wake-sound', soundEnabled ? 'on' : 'off'); } catch { /* optional */ }
  updateHud();
  if (event) returnFocusToFlight(event);
}

$('wipeProgressBtn').addEventListener('click',()=>{
  suspend();clearInput();
  $('resetError').hidden=true;
  $('resetDialog').returnValue='cancel';$('resetDialog').showModal();
});
function showResetError(message){
  const error=$('resetError');
  error.setAttribute('data-i18n',message);
  error.textContent=t(message);
  error.hidden=false;
  $('resetDialog').returnValue='cancel';
  requestAnimationFrame(()=>{
    if(!$('resetDialog').open&&!$('guideDialog').open)$('resetDialog').showModal();
    if($('resetDialog').open)error.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  });
}
$('resetDialog').addEventListener('close',()=>{
  if($('resetDialog').returnValue!=='reset'){
    focusLaunchAfterModalClose();
    return;
  }
  // A user-requested wipe may safely retry access even if the startup getter
  // failed; ordinary saves must not overwrite an old profile we could not read.
  if(!storage){
    try{storage=window.localStorage;storageAccessFailed=false;}
    catch{storageAccessFailed=true;}
  }
  const fresh=resetProfile(storage);
  if(!fresh.saved && (storage||storageAccessFailed)){
    // Storage may hide an old save while access is denied. Keep the dialog
    // open until the replacement profile has actually been written.
    showResetError('Could not erase saved progress. Check browser storage and try again.');
    return;
  }
  profile=fresh.profile;
  hangar.profile=profile;
  readyStageExplicit=false;readyFormExplicit=false;
  recordSaveResult(fresh.saved);
  settlement=null;lastState='';clearInput();
  game.reset({stageId:1,rank:profile.rank,pulses:profile.pulses,form:profile.form});game.state='ready';game.events=[];
  accumulator=0;previous=performance.now();hangar.selectedStage=1;hangar.render();
  syncStageText();updateHud();
  if(fresh.saved&&!fresh.scoreCleared){
    showResetError('Campaign progress was reset, but an old score could not be erased. Check browser storage and try again.');
    return;
  }
  focusLaunchAfterModalClose();
});
$('launchBtn').addEventListener('click', launch);
$('restartBtn').addEventListener('click',restart);
$('soundBtn').addEventListener('click',toggleSound);



$('touchPauseBtn').addEventListener('click', pause);
$('guideBtn').addEventListener('click',()=>{
  suspend();
  $('guideDialog').showModal();
  drawPickupLegend();
});
$('closeGuideBtn').addEventListener('click',()=>$('guideDialog').close());
$('guideDialog').addEventListener('click',event=>{
  if(event.target!==$('guideDialog'))return;
  const bounds=event.target.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.target.close();
});
$('guideDialog').addEventListener('close',()=>{clearInput();focusLaunchAfterModalClose();});
$('hangarPanel').addEventListener('focusin',()=>{
  // Keyboard navigation can scroll the playfield away while combat continues.
  // Stage selection is a menu, so freeze the flight as soon as it gains focus.
  if(game.state==='playing')suspend();
});
function syncImmersionControls(){
  const active=document.body.classList.contains('is-immersive');
  const modeButton=$('immersionBtn');
  modeButton.setAttribute('aria-pressed',String(active));
  modeButton.setAttribute('aria-label',t(active?'Exit immersion':'Enter immersion'));
  modeButton.title=t(active?'Exit immersion':'Enter immersion');
  $('exitImmersionBtn').hidden=!active;
  $('immersionControls').hidden=!active;
  setHudText('exitImmersionBtn',t('Exit'));
  setHudAttribute('exitImmersionBtn','aria-label',t('Exit immersion'));
  setHudText('immersionFormBtn',`${t('Form')} ${FORM_KEYS.indexOf(game.form)+1}`);
  setHudAttribute('immersionFormBtn','aria-label',`${t('Change form')}: ${t(FORMS[game.form].name)}`);
  $('immersionFormBtn').disabled=!!game.finale?.ultimate||!!game.transform||!['ready','playing'].includes(game.state);
  $('immersionFocusBtn').disabled=$('focusBtn').disabled;
  setHudText('immersionFocusBtn',t('Focus'));
  setHudAttribute('immersionFocusBtn','aria-pressed',String(touchFocus));
  $('immersionPulseBtn').disabled=$('pulseBtn').disabled;
  setHudText('immersionPulseBtn',`${t('Pulse')} ${game.pulses}`);
  setHudAttribute('immersionPulseBtn','aria-label',t('Pulse: {count} of {max}',{count:game.pulses,max:CONFIG.maxPulses}));
  $('immersionPauseBtn').disabled=$('touchPauseBtn').disabled;
  setHudText('immersionPauseBtn',t(game.state==='paused'?'Resume':'Pause'));
}
function setImmersion(active,{focus=true}={}){
  if(document.body.classList.contains('is-immersive')===active)return;
  document.body.classList.toggle('is-immersive',active);
  syncImmersionControls();
  syncFlightSaveWarning();
  pausedCanvasRendered=false;
  scheduleCanvasFit();
  if(active){
    window.scrollTo({top:0,behavior:'instant'});
    if(focus)(game.state==='playing'?canvas:$('launchBtn')).focus({preventScroll:true});
  }else if(focus){
    if(game.state==='playing'){revealFlight();canvas.focus({preventScroll:true});}
    else{window.scrollTo({top:0,behavior:'instant'});$('immersionBtn').focus({preventScroll:true});}
  }
}
$('immersionBtn').addEventListener('click',()=>setImmersion(true));
$('exitImmersionBtn').addEventListener('click',()=>setImmersion(false));
$('immersionFormBtn').addEventListener('click',event=>{
  const next=FORM_KEYS[(FORM_KEYS.indexOf(game.form)+1)%FORM_KEYS.length];
  changeForm(next);
  returnFocusToFlight(event);
});
$('immersionFocusBtn').addEventListener('click', toggleFocus);
$('immersionPulseBtn').addEventListener('click', usePulse);
$('immersionPauseBtn').addEventListener('click',pause);
function syncFullscreenButton(){
  const active=!!document.fullscreenElement,button=$('fullscreenBtn');
  const unavailable=fullscreenUnavailable&&!active;
  $('fullscreenIconPath').setAttribute('d',unavailable
    ?'M12 3 22 21H2L12 3ZM12 9v5m0 3v.01'
    :active?'M4 9h5V4m6 0v5h5M9 20v-5H4m11 5v-5h5'
    :'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5');
  button.classList.toggle('is-unavailable',unavailable);
  const description=unavailable?t('Fullscreen did not start. Try again or use a browser that supports it.'):t(active?'Exit fullscreen':'Enter fullscreen');
  button.title=description;
  button.setAttribute('aria-pressed',String(active));
  button.setAttribute('aria-label',description);
}
$('fullscreenBtn').addEventListener('click', async event => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreenUnavailable=true;syncFullscreenButton();
  }
  returnFocusToFlight(event);
});
document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  if(document.fullscreenElement)fullscreenUnavailable=false;
  syncFullscreenButton();
  scheduleCanvasFit();
  requestAnimationFrame(revealFlight);
});
$('pulseBtn').addEventListener('click', usePulse);
$('focusBtn').addEventListener('click', toggleFocus);

window.addEventListener('keydown', e => {
  if ($('guideDialog').open) return;
  // Leave browser and operating-system shortcuts alone while a flight is active.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ($('resetDialog').open) return;
  if(e.code==='Escape'&&document.body.classList.contains('is-immersive')){
    e.preventDefault();
    if(!e.repeat)setImmersion(false);
    return;
  }
  if(e.code==='Tab'&&!e.shiftKey&&game.state==='playing'&&e.target===canvas
      &&!document.body.classList.contains('is-immersive')
      &&$('form-primary').getBoundingClientRect().top>(window.visualViewport?.height??window.innerHeight)-44){
    // On a very short screen the next control would scroll the ship away.
    // Show the compact controls beside the still-visible playfield instead.
    setImmersion(true,{focus:false});
  }
  if(e.target instanceof Element){
    if(e.target.closest('#hangarPanel'))return;
    if(e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    // Space and Enter activate the focused control. Movement and other flight
    // shortcuts still work after keyboard users choose a form, Focus, or Pulse.
    if((e.code==='Space'||e.code==='Enter')&&e.target!==canvas&&e.target.closest('a,button,summary,[role="button"],[role="link"],[role="menuitem"]'))return;
  }
  if(e.code==='Space' && ['playing','paused'].includes(game.state)){
    e.preventDefault();if(!e.repeat)pause();return;
  }
  // Outside an active flight, arrows and Space belong to page navigation.
  if (game.state === 'playing' && FLIGHT_KEYS.has(e.code)
      && !(e.target instanceof HTMLButtonElement && e.code === 'Space')) e.preventDefault();
  if (e.repeat) return;
  if (game.state === 'playing') keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') pause();
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyX') usePulse();
  const formKey = FORM_SHORTCUTS[e.code];
  if(formKey)changeForm(formKey);
  if (e.code === 'Enter' && e.target === canvas && game.state !== 'playing') launch();
});
window.addEventListener('keyup', e => keys.delete(e.code));

function pointerTarget(e) {
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return { x: game.player.x, y: game.player.y };
  return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
}
canvas.addEventListener('pointerdown', e => {
  if (game.state !== 'playing' || pointer.active) return;
  e.preventDefault(); audio.unlock(); canvas.focus({ preventScroll: true });
  pointer.active = true; pointer.id = e.pointerId; pointer.touch = e.pointerType === 'touch';
  pointer.lastX = e.clientX; pointer.lastY = e.clientY;
  pointer.target = pointer.touch ? { x: game.player.x, y: game.player.y } : pointerTarget(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  if (pointer.touch) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      pointer.target.x = Math.max(24, Math.min(W - 24, pointer.target.x + (e.clientX - pointer.lastX) / rect.width * W));
      pointer.target.y = Math.max(60, Math.min(H - 32, pointer.target.y + (e.clientY - pointer.lastY) / rect.height * H));
    }
    pointer.lastX = e.clientX; pointer.lastY = e.clientY;
  } else pointer.target = pointerTarget(e);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => {
  if (e.pointerId === pointer.id) { pointer.active = false; pointer.target = null; pointer.id = null; }
});

function suspend() { clearInput(); if (game.state === 'playing') { game.pause(); accumulator = 0; updateHud(); } }
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
function leavePage() {
  audio.stopMusic();
  if(!profile.activeAttempt)return;
  settleCurrentRun(true);
  if(game.state==='victory'||game.state==='gameover')return;
  // Back/forward cache can restore this same page. It must restore a fresh start,
  // not revive an abandoned battle after its checkpoint transaction was closed.
  game.reset({stageId:game.stageId,...getStageCheckpoint(profile,game.stageId),form:profile.form});
  game.state='ready';game.events=[];settlement=null;lastState='';clearInput();
  readyStageExplicit=false;readyFormExplicit=false;
  accumulator=0;previous=performance.now();syncStageText();updateHud();
}
window.addEventListener('beforeunload', leavePage);
window.addEventListener('pagehide', leavePage);

function frame(now) {
  const elapsed = Math.min(0.1, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (game.state!=='paused') visualTime += elapsed;
  if (game.state === 'playing') {
    accumulator += elapsed;
    const input = {
      x: Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')),
      y: Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW')),
      focus: touchFocus || keys.has('ShiftLeft') || keys.has('ShiftRight'),
      fire: true,
      target: pointer.active ? pointer.target : null,
    };
    while (accumulator >= 1 / 120 && game.state === 'playing') { game.update(1 / 120, input); accumulator -= 1 / 120; }
  } else if (game.state !== 'paused') game.updateEffects(elapsed);
  updateDeparture();
  const events=game.events.splice(0);
  for(const event of events)audio.play(event.name);
  // Ready-screen form changes are saved in changeForm(). A recovered ready
  // screen may belong to another live tab, so its cosmetic event must not write.
  if(game.state==='playing'&&events.some(event=>event.name==='transform')){
    retainForm(profile,game.form);saveCampaign();
  }
  audio.updateMusic(game.stageId,game.state==='playing');
  if(game.state!=='paused'||!pausedCanvasRendered){
    drawGame(visualTime);
    // Pause renders once, then redraws if the delayed atlas resolves.
    pausedCanvasRendered=game.state==='paused';
  }
  const hudState=game.state==='victory'&&departure&&!departure.complete?'departing':game.state;
  if (now - lastHud > 80 || lastState !== hudState) { updateHud(); lastHud = now; }
  requestAnimationFrame(frame);
}
function refreshLanguage(){
  translateDocument();hangar?.render();syncStageText();lastState='';updateHud();
  pausedCanvasRendered=false;
  syncFullscreenButton();drawPickupLegend();
}
$('languageBtn').addEventListener('click',event=>{
  setLanguage(getLanguage()==='zh-CN'?'en':'zh-CN');
  returnFocusToFlight(event);
});
window.addEventListener('languagechange',refreshLanguage);
hangar = new Hangar(profile, { launch: startStage, pause: suspend, select: previewStage });
window.addEventListener('storage',event=>{
  if(event.key===SAVE_KEY&&event.storageArea===storage)refreshReadyProfileFromStorage();
});
if(!skipStartupSave)saveCampaign();
refreshLanguage();
requestAnimationFrame(frame);
