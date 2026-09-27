import { getMusicTrack, musicStepEvents, MUSIC_STEPS } from './music.js';

// Soft harmonic recipes give each score a different ensemble without audio assets.
const MUSIC_PATCHES = {
  flute:{type:'sine', harmonics:[1,.025,.09,.015,.025], attack:.045, color:1.05, sustain:.82},
  bell:{type:'sine', harmonics:[1,.06,.30,.02,.12,.025], attack:.004, color:1.6, decay:true},
  mallet:{type:'sine', harmonics:[1,.38,.12,.045], attack:.005, color:1.2, decay:true},
  pluck:{type:'triangle', harmonics:[1,.13,.31,.07,.12], attack:.006, color:1.35, decay:true},
  reed:{type:'triangle', harmonics:[1,.28,.42,.12,.20,.065], attack:.018, color:.8, sustain:.65},
  horn:{type:'triangle', harmonics:[1,.45,.27,.13,.07], attack:.065, color:.85, sustain:.8},
  pad:{type:'sine', harmonics:[1,.12,.035], attack:.34, color:.65, sustain:.78},
  bass:{type:'triangle', attack:.012, color:500, sustain:.55},
};
function createNoiseBuffer(context){
  const buffer=context.createBuffer(1,context.sampleRate,context.sampleRate);
  const samples=buffer.getChannelData(0);
  // Sound must not consume the same Math.random stream as enemy and loot rolls.
  let state=0x9e3779b9;
  for(let i=0;i<samples.length;i++){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    samples[i]=state/2147483648-1;
  }
  return buffer;
}
/** Small, self-contained arcade sounds. Call unlock() from a user gesture. */
export class AudioEngine {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.lastPlayed = new Map();
    this.noiseBuffer = null;
    this.voices = 0;
    this.musicVoices = new Set();
    this.musicVoiceCleanup = new Map();
    this.musicVoiceEnd = new Map();
    this.effectVoiceEnd = new Map();
    this.musicWaves = new Map();
    this.musicTrackId = 0; this.musicStep = 0; this.musicPlaying = false;
    this.nextMusicAt = 0; this.musicBus = null;
  }

  async unlock() {
    let candidate=null;
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        candidate = new Context();
        const master=candidate.createGain(),musicBus=candidate.createGain();
        master.gain.value=this.enabled ? .24 : 0;
        musicBus.gain.value=.65;
        master.connect(candidate.destination);
        musicBus.connect(master);
        if(this.context){
          this.stopMusic();this.lastPlayed.clear();
          for(const {cleanup} of [...this.effectVoiceEnd.values()])cleanup();
          this.effectVoiceEnd.clear();this.voices=0;
          this.musicWaves.clear();this.noiseBuffer=null;
        }
        this.context=candidate;this.master=master;this.musicBus=musicBus;
      }
      // Safari may report "interrupted" after a call, device change, or tab
      // interruption; a later user gesture can resume that same context.
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      // Sound is optional; browser audio restrictions must never stop the game.
      if(candidate && candidate!==this.context){
        try{await candidate.close?.();}catch{/* A failed context is already unusable. */}
      }
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if(!this.enabled)this.stopMusic();
    if (this.master && this.context) {
      try{this.master.gain.setTargetAtTime(this.enabled ? 0.24 : 0, this.context.currentTime, 0.015);}
      catch{/* A disconnected audio device should never stop the game controls. */}
    }
  }

  stopMusic() {
    this.musicPlaying=false;
    for(const source of [...this.musicVoices]){
      try{source.stop();}catch{/* Already ended. */}
      this.musicVoiceCleanup.get(source)?.();
    }
    this.musicVoices.clear();
    this.musicVoiceEnd.clear();
  }

  reapEndedVoices(now) {
    // Ended events can be delayed when a tab is frozen or an output device is
    // interrupted. Expired nodes must not occupy the voice budget forever.
    for(const [source,endAt] of this.musicVoiceEnd)
      if(endAt<=now-.05)this.musicVoiceCleanup.get(source)?.();
    for(const {endAt,cleanup} of this.effectVoiceEnd.values())
      if(endAt<=now-.05)cleanup();
  }

  updateMusic(stageId,playing) {
    const trackId=getMusicTrack(stageId).id;
    if(trackId!==this.musicTrackId){this.stopMusic();this.musicTrackId=trackId;this.musicStep=0;}
    if(!playing||!this.enabled||!this.context||this.context.state!=='running'){
      if(this.musicPlaying)this.stopMusic();return;
    }
    const now=this.context.currentTime;
    this.reapEndedVoices(now);
    if(!this.musicPlaying){this.musicPlaying=true;this.nextMusicAt=now+.035;}
    if(this.nextMusicAt<now-.1)this.nextMusicAt=now+.035;
    while(this.nextMusicAt<now+.16){
      const {track,stepSeconds,events}=musicStepEvents(stageId,this.musicStep);
      for(const event of events)this.musicNote(event,track,this.nextMusicAt+(event.delay||0));
      this.musicStep=(this.musicStep+1)%MUSIC_STEPS;this.nextMusicAt+=stepSeconds;
    }
  }

  musicNote(event,track,when) {
    if(this.musicVoices.size>=32||!this.context||!this.musicBus)return;
    const c=this.context;
    let source,filter,envelope,panner,cleaned=false;
    const cleanup=()=>{
      if(cleaned)return;
      cleaned=true;
      for(const node of [source,filter,envelope,panner])try{node?.disconnect();}catch{/* The graph may be partial. */}
      if(source){this.musicVoices.delete(source);this.musicVoiceCleanup.delete(source);this.musicVoiceEnd.delete(source);}
    };
    try{
      envelope=c.createGain();filter=c.createBiquadFilter();
      const percussion=['snare','hat'].includes(event.voice);
      const instrument=event.instrument||event.voice,patch=MUSIC_PATCHES[instrument]||MUSIC_PATCHES.flute;
      if(percussion){
        if(!this.noiseBuffer)this.noiseBuffer=createNoiseBuffer(c);
        source=c.createBufferSource();source.buffer=this.noiseBuffer;
        filter.type=event.voice==='hat'?'highpass':'bandpass';
        filter.frequency.value=event.voice==='hat'?5700:1800;
        if(filter.Q)filter.Q.value=.65;
      }else{
        source=c.createOscillator();source.type=patch.type;
        const pitchedDrum=['kick','tom','rim'].includes(event.voice);
        if(!pitchedDrum&&patch.harmonics&&c.createPeriodicWave&&source.setPeriodicWave){
          if(!this.musicWaves.has(instrument)){
            const imaginary=Float32Array.from([0,...patch.harmonics]);
            this.musicWaves.set(instrument,c.createPeriodicWave(new Float32Array(imaginary.length),imaginary));
          }
          source.setPeriodicWave(this.musicWaves.get(instrument));
        }
        const frequency=event.voice==='kick'?112:event.voice==='rim'?830:440*2**((event.note-69)/12);
        source.frequency.setValueAtTime(frequency,when);
        if(pitchedDrum){
          source.type=event.voice==='rim'?'triangle':'sine';
          source.frequency.exponentialRampToValueAtTime(event.voice==='kick'?39:event.voice==='rim'?390:frequency*.52,when+event.duration);
        }
        filter.type='lowpass';
        const cutoff=instrument==='bass'?patch.color:track.color*(patch.color||1);
        filter.frequency.setValueAtTime(cutoff,when);
        if(patch.decay&&!pitchedDrum)filter.frequency.exponentialRampToValueAtTime(Math.max(700,cutoff*.38),when+event.duration);
      }
      const drum=percussion||['kick','tom','rim'].includes(event.voice);
      const attack=drum?.004:patch.attack,release=when+event.duration;
      envelope.gain.setValueAtTime(.0001,when);
      envelope.gain.exponentialRampToValueAtTime(event.volume,when+Math.min(attack,event.duration*.25));
      if(!drum&&patch.sustain)envelope.gain.exponentialRampToValueAtTime(event.volume*patch.sustain,when+event.duration*.62);
      envelope.gain.exponentialRampToValueAtTime(.0001,release);
      source.connect(filter);filter.connect(envelope);
      panner=c.createStereoPanner?.();
      if(panner){panner.pan.value=event.pan||0;envelope.connect(panner);panner.connect(this.musicBus);}
      else envelope.connect(this.musicBus);
      this.musicVoices.add(source);this.musicVoiceCleanup.set(source,cleanup);
      this.musicVoiceEnd.set(source,release+.02);
      source.onended=cleanup;
      source.start(when);source.stop(release+.02);
    }catch{
      try{source?.stop();}catch{/* The source may not have started. */}
      cleanup();
    }
  }

  play(name) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    this.reapEndedVoices(now);
    const cooldown = { shoot: 0.09, enemyShoot: 0.19, hit: 0.06, explode: 0.06 }[name] ?? 0.12;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < cooldown) return;
    this.lastPlayed.set(name, now);
    const tone = (frequency, endFrequency, duration, volume, type = 'sine', delay = 0) =>
      this.tone(frequency, endFrequency, duration, volume, type, now + delay);
    switch (name) {
      case 'missiles':
        this.noise(0.22, 0.18, 1600, now);
        tone(150, 420, 0.2, 0.2, 'triangle');
        break;
      case 'laser':
        tone(220, 1320, 0.28, 0.17, 'sawtooth');
        tone(880, 440, 0.55, 0.1, 'sine', 0.08);
        break;
      case 'shield':
        tone(330, 660, 0.3, 0.22, 'sine');
        tone(495, 990, 0.42, 0.13, 'sine', 0.07);
        break;
      case 'shoot':
        tone(780, 320, 0.065, 0.12, 'triangle');
        break;
      case 'enemyShoot':
        tone(235, 160, 0.065, 0.065, 'sine');
        break;
      case 'hit':
        tone(165, 72, 0.045, 0.14, 'triangle');
        break;
      case 'explode':
        this.noise(0.19, 0.3, 950, now);
        tone(108, 30, 0.21, 0.3);
        break;
      case 'pickup':
        tone(660, 720, 0.12, 0.23, 'sine');
        tone(990, 1100, 0.19, 0.19, 'sine', 0.08);
        break;
      case 'pulse':
        tone(130, 44, 0.46, 0.38);
        tone(880, 120, 0.38, 0.2, 'triangle');
        this.noise(0.38, 0.25, 1700, now);
        break;
      case 'playerHit':
        this.noise(0.24, 0.25, 1300, now);
        tone(270, 60, 0.28, 0.32, 'triangle');
        break;
      case 'boss':
        [0, 0.22, 0.44].forEach((delay) => tone(110, 85, 0.18, 0.25, 'triangle', delay));
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) =>
          tone(frequency, frequency, 0.3, 0.22, 'sine', i * 0.12));
        break;
      case 'lose':
        [330, 261.63, 196].forEach((frequency, i) =>
          tone(frequency, frequency * 0.94, 0.33, 0.2, 'triangle', i * 0.17));
        break;
      case 'finale':
        [392,493.88,587.33,783.99].forEach((frequency,i)=>tone(frequency,frequency,.5,.19,'sine',i*.18));
        break;
      case 'coreOpen':
        tone(440,660,.2,.16,'sine');tone(880,880,.3,.14,'sine',.12);
        break;
      case 'bossPhase':
        tone(160,240,.2,.13,'triangle');
        break;
      case 'transform':
        tone(440,660,0.12,0.09,'sine');
        break;
      case 'start':
        tone(330, 440, 0.16, 0.2, 'triangle');
        tone(660, 880, 0.22, 0.18, 'sine', 0.1);
        break;
    }
  }

  tone(frequency, endFrequency, duration, volume, type, when) {
    if (this.voices >= 40) return;
    const context=this.context;
    let oscillator,envelope,active=false;
    const cleanup=()=>{
      for(const node of [oscillator,envelope])try{node?.disconnect();}catch{/* The graph may be partial. */}
      if(oscillator)this.effectVoiceEnd.delete(oscillator);
      if(active){active=false;if(this.context===context)this.voices-=1;}
    };
    try{
      oscillator=context.createOscillator();envelope=context.createGain();
      oscillator.type=type;
      oscillator.frequency.setValueAtTime(frequency,when);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency,when+duration);
      envelope.gain.setValueAtTime(.0001,when);
      envelope.gain.exponentialRampToValueAtTime(volume,when+.006);
      envelope.gain.exponentialRampToValueAtTime(.0001,when+duration);
      oscillator.connect(envelope);envelope.connect(this.master);
      this.voices+=1;active=true;oscillator.onended=cleanup;
      this.effectVoiceEnd.set(oscillator,{endAt:when+duration+.02,cleanup});
      oscillator.start(when);oscillator.stop(when+duration+.02);
    }catch{
      try{oscillator?.stop();}catch{/* It may never have started. */}
      cleanup();
    }
  }

  noise(duration, volume, cutoff, when) {
    if (this.voices >= 40) return;
    const context=this.context;
    let source,filter,envelope,active=false;
    const cleanup=()=>{
      for(const node of [source,filter,envelope])try{node?.disconnect();}catch{/* The graph may be partial. */}
      if(source)this.effectVoiceEnd.delete(source);
      if(active){active=false;if(this.context===context)this.voices-=1;}
    };
    try{
      if(!this.noiseBuffer)this.noiseBuffer=createNoiseBuffer(context);
      source=context.createBufferSource();filter=context.createBiquadFilter();envelope=context.createGain();
      source.buffer=this.noiseBuffer;filter.type='lowpass';
      filter.frequency.setValueAtTime(cutoff,when);
      filter.frequency.exponentialRampToValueAtTime(80,when+duration);
      envelope.gain.setValueAtTime(.0001,when);
      envelope.gain.exponentialRampToValueAtTime(volume,when+.006);
      envelope.gain.exponentialRampToValueAtTime(.0001,when+duration);
      source.connect(filter);filter.connect(envelope);envelope.connect(this.master);
      this.voices+=1;active=true;source.onended=cleanup;
      this.effectVoiceEnd.set(source,{endAt:when+duration+.02,cleanup});
      source.start(when);source.stop(when+duration+.02);
    }catch{
      try{source?.stop();}catch{/* It may never have started. */}
      cleanup();
    }
  }
}
