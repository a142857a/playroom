/* Felt Piano — a small, sample-free instrument built on the Web Audio API. */
(function (root, factory) {
  'use strict';
  const exports = factory();
  if (typeof module === 'object' && module.exports) module.exports = exports;
  if (root) root.FeltAudio = exports;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  // General MIDI programs are zero-based, as written in a MIDI program change.
  const INSTRUMENTS = Object.freeze([
    { id: 'felt', name: 'Felt Piano', family: 'Piano', description: 'Soft hammers, intimate and mellow.', gmProgram: 0 },
    { id: 'grand', name: 'Concert Grand', family: 'Piano', description: 'Bright strings with a resonant acoustic body.', gmProgram: 0 },
    { id: 'electric', name: 'Electric Piano', family: 'Keys', description: 'Rounded tines with a shimmering attack.', gmProgram: 4 },
    { id: 'organ', name: 'Church Organ', family: 'Keys', description: 'Clear, sustained pipes and octave harmonics.', gmProgram: 19 },
    { id: 'strings', name: 'Strings', family: 'Ensemble', description: 'Slowly blooming, softly detuned strings.', gmProgram: 48 },
    { id: 'synth', name: 'Warm Synth', family: 'Synth', description: 'A warm, gently moving analog-style pad.', gmProgram: 89 },
    { id: 'marimba', name: 'Marimba', family: 'Mallets', description: 'A woody strike with a short, hollow ring.', gmProgram: 12 },
    { id: 'musicbox', name: 'Music Box', family: 'Mallets', description: 'Bright metal tines and delicate bell overtones.', gmProgram: 10 },
    { id: 'xylophone', name: 'Xylophone', family: 'Mallets', description: 'Bright wooden bars with a crisp, short ring.', gmProgram: 13 },
    { id: 'vibraphone', name: 'Vibraphone', family: 'Mallets', description: 'Resonant metal bars with a gentle tremolo.', gmProgram: 11 },
    { id: 'harp', name: 'Harp', family: 'Strings', description: 'Warm plucked strings and a delicate, falling shimmer.', gmProgram: 46 },
    { id: 'flute', name: 'Flute', family: 'Winds', description: 'Airy, sustained woodwind with soft vibrato.', gmProgram: 73 },
  ].map(instrument => Object.freeze(instrument)));
  const PRESETS = Object.freeze({
    felt: {
      harmonics: [1, 0.34, 0.145, 0.069, 0.033, 0.014],
      decay: 3.9, attack: 0.007, release: 0.22, brightness: 4400,
      detune: 1.8, hammer: 0.025, inharmonicity: 0.00010,
    },
    grand: {
      harmonics: [1, 0.50, 0.255, 0.14, 0.085, 0.045, 0.025, 0.012],
      decay: 4.7, attack: 0.003, release: 0.15, brightness: 9500,
      detune: 2.6, hammer: 0.042, inharmonicity: 0.00015,
    },
    electric: {
      harmonics: [1, 0.26, 0.025, 0.10, 0.012, 0.023],
      decay: 4.0, attack: 0.004, release: 0.25, brightness: 7200,
      detune: 0.6, hammer: 0.010, inharmonicity: 0.000025,
    },
    organ: {
      harmonics: [1, 0.48, 0.19, 0.34, 0.055, 0.10, 0.018, 0.12],
      decay: 4, attack: 0.018, release: 0.13, brightness: 11000,
      detune: 0, hammer: 0, inharmonicity: 0, sustained: true,
      sustainLevel: 0.78, level: 0.68, single: true,
    },
    strings: {
      harmonics: [1, 0.41, 0.29, 0.20, 0.15, 0.105, 0.075, 0.045],
      decay: 4, attack: 0.32, release: 0.48, brightness: 5200,
      detune: 5.5, hammer: 0, inharmonicity: 0, sustained: true,
      sustainLevel: 0.85, level: 0.72, doublePartials: true,
    },
    synth: {
      harmonics: [1, 0.48, 0.30, 0.23, 0.16, 0.10, 0.070, 0.045],
      decay: 4, attack: 0.07, release: 0.38, brightness: 3100,
      detune: 8, hammer: 0, inharmonicity: 0, sustained: true,
      sustainLevel: 0.68, level: 0.80, doublePartials: true,
      filterEnvelope: true,
    },
    marimba: {
      harmonics: [1, 0.40, 0.18, 0.065], ratios: [1, 4, 10.04, 14.6],
      decay: 1.3, attack: 0.002, release: 0.18, brightness: 7000,
      detune: 0, hammer: 0.055, inharmonicity: 0, single: true,
      level: 1.12, minDecay: 0.38, tailPower: 0.72,
    },
    musicbox: {
      harmonics: [1, 0.34, 0.21, 0.10, 0.035], ratios: [1, 2.756, 5.404, 8.933, 13.35],
      decay: 3.1, attack: 0.002, release: 0.32, brightness: 12500,
      detune: 0, hammer: 0, inharmonicity: 0, single: true,
      level: 0.9, tailPower: 0.34,
    },
    xylophone: {
      harmonics: [1, 0.62, 0.31, 0.12], ratios: [1, 3, 6, 10],
      decay: 0.74, attack: 0.0015, release: 0.10, brightness: 13800,
      detune: 0, hammer: 0.09, inharmonicity: 0, single: true,
      level: 1.05, minDecay: 0.22, tailPower: 0.48,
    },
    vibraphone: {
      harmonics: [1, 0.43, 0.22, 0.075], ratios: [1, 4, 9.6, 16],
      decay: 4.2, attack: 0.006, release: 0.30, brightness: 10800,
      detune: 0, hammer: 0.009, inharmonicity: 0, single: true,
      level: 1.04, tailPower: 0.27, tremoloRate: 5.2, tremoloDepth: 0.18,
    },
    harp: {
      harmonics: [1, 0.56, 0.31, 0.18, 0.10, 0.055, 0.025],
      decay: 2.6, attack: 0.0015, release: 0.26, brightness: 6800,
      detune: 0.4, hammer: 0.018, inharmonicity: 0.000006,
      level: 0.92, minDecay: 0.75, tailPower: 0.92,
    },
    flute: {
      harmonics: [1, 0.15, 0.035, 0.009],
      decay: 4, attack: 0.065, release: 0.20, brightness: 4200,
      detune: 0, hammer: 0, inharmonicity: 0, single: true, sustained: true,
      sustainLevel: 0.88, level: 0.96, air: 0.065, vibratoRate: 5.1, vibratoDepth: 7,
    },
  });

  class PianoAudio {
    constructor(options = {}) {
      // Context injection allows offline renders and deterministic voice lifecycle tests.
      this.context = options.context || null;
      this.instrument = 'felt';
      this.volume = 0.7;
      this.reverb = 0.25;
      this.sustain = false;
      this.maxVoices = clamp(Math.floor(finite(options.maxVoices, 40)), 1, 96);
      this.voices = new Map();
      this._retiring = new Set();
      this._nextVoice = 1;
      this._ready = false;
      this._unlockPromise = null;
      this._clicks = new Set();
    }

    async unlock() {
      try {
        if (!this.context || this.context.state === 'closed') {
          const scope = typeof window !== 'undefined' ? window : globalThis;
          const AudioContextClass = scope.AudioContext || scope.webkitAudioContext;
          if (!AudioContextClass) return false;
          this.context = new AudioContextClass({ latencyHint: 'interactive' });
          this._ready = false;
        }
        // No await before context construction/resume: retain the browser's user gesture.
        if (!this._ready) this._buildGraph();
        if (this.context.state === 'suspended' || this.context.state === 'interrupted') {
          if (!this._unlockPromise) {
            this._unlockPromise = this.context.resume().finally(() => { this._unlockPromise = null; });
          }
          await this._unlockPromise;
        }
        return this.context.state === 'running';
      } catch (_) {
        return false;
      }
    }

    _buildGraph() {
      const ctx = this.context;
      this._input = ctx.createGain();
      this._dry = ctx.createGain();
      this._wet = ctx.createGain();
      this._reverb = ctx.createConvolver();
      this._limiter = ctx.createDynamicsCompressor();
      this._master = ctx.createGain();
      this._input.connect(this._dry);
      this._input.connect(this._reverb);
      this._reverb.connect(this._wet);
      this._dry.connect(this._limiter);
      this._wet.connect(this._limiter);
      this._limiter.connect(this._master);
      this._master.connect(ctx.destination);
      this._limiter.threshold.value = -13;
      this._limiter.knee.value = 8;
      this._limiter.ratio.value = 16;
      this._limiter.attack.value = 0.002;
      this._limiter.release.value = 0.16;
      this._master.gain.value = this.volume;
      this._dry.gain.value = 1 - this.reverb * 0.18;
      this._wet.gain.value = this.reverb * 0.52;
      this._reverb.buffer = this._makeImpulse();
      this._noise = this._makeNoise();
      this._airNoise = this._makeAirNoise();
      this._ready = true;
    }

    _makeImpulse() {
      const ctx = this.context;
      const length = Math.ceil(ctx.sampleRate * 1.8);
      const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
      let seed = 0x71a91;
      for (let channel = 0; channel < 2; channel += 1) {
        const samples = buffer.getChannelData(channel);
        let smooth = 0;
        for (let i = 0; i < length; i += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          smooth = smooth * 0.63 + (seed / 2147483648 - 1) * 0.37;
          const t = i / ctx.sampleRate;
          // A brief pre-delay separates the attack from the room's diffuse tail.
          samples[i] = t < 0.012 ? 0 : smooth * Math.exp(-t * 4.3) * Math.min(1, (t - 0.012) / 0.018);
        }
      }
      return buffer;
    }

    _makeNoise() {
      const ctx = this.context;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.035), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 23917;
      let previous = 0;
      for (let i = 0; i < samples.length; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        previous = previous * 0.55 + (seed / 2147483648 - 1) * 0.45;
        samples[i] = previous * Math.exp(-i / (ctx.sampleRate * 0.005));
      }
      return buffer;
    }

    _makeAirNoise() {
      const ctx = this.context;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 61831;
      for (let i = 0; i < samples.length; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 2147483648 - 1;
      }
      return buffer;
    }

    noteOn(midi, velocity = 0.75) {
      if (!this.context || !this._ready || this.context.state === 'closed') return null;
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
      velocity = clamp(finite(velocity, 0.75), 0, 1);
      if (velocity === 0) return null;
      this._makeRoom();

      const ctx = this.context;
      const preset = PRESETS[this.instrument];
      const now = ctx.currentTime;
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const decay = clamp(preset.decay * Math.pow(220 / frequency, 0.28), preset.minDecay || 1.2, 7.5);
      // Held wind, organ, ensemble and synth notes have no natural stop. Key release,
      // pedal lift, panic and voice stealing all stop and dispose their sources.
      const end = preset.sustained ? Infinity : now + Math.min(14, decay * 2.1 + 0.2);
      const output = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
      output.gain.value = 1;
      filter.type = 'lowpass';
      filter.Q.value = 0.45;
      const brightness = Math.min(ctx.sampleRate * 0.42, preset.brightness * (0.45 + velocity * 0.65));
      filter.frequency.setValueAtTime(Math.min(ctx.sampleRate * 0.44, Math.max(frequency * 1.5, brightness)), now);
      if (!preset.sustained || preset.filterEnvelope) {
        filter.frequency.exponentialRampToValueAtTime(Math.min(ctx.sampleRate * 0.44,
          Math.max(preset.sustained ? 1600 : 500, frequency * 1.7)), now + (preset.sustained ? 0.55 : decay * 0.65));
      }
      if (pan.pan) pan.pan.value = clamp((midi - 60) / 65, -0.45, 0.45);
      filter.connect(output);
      output.connect(pan);
      pan.connect(this._input);
      const voice = {
        id: this._nextVoice++, midi, held: true, released: false,
        started: now, end, preset, instrument: this.instrument, output, sources: [], nodes: [output, filter, pan], remaining: 0,
      };
      this.voices.set(voice.id, voice);

      const level = Math.pow(velocity, 1.35) * 0.235 * (preset.level || 1);
      const trackSource = source => {
        voice.sources.push(source);
        voice.remaining += 1;
        source.onended = () => {
          voice.remaining -= 1;
          if (voice.remaining === 0) this._dispose(voice);
        };
      };
      // Keep modulation before the release gain, so panic and pedal lift also
      // silence moving timbres. Modulators share the voice's source lifecycle.
      let timbreInput = filter;
      let vibrato = null;
      if (preset.tremoloRate) {
        const tremolo = ctx.createGain();
        const oscillator = ctx.createOscillator();
        const depth = ctx.createGain();
        tremolo.gain.value = 1 - preset.tremoloDepth;
        oscillator.frequency.value = preset.tremoloRate;
        depth.gain.value = preset.tremoloDepth;
        oscillator.connect(depth);
        depth.connect(tremolo.gain);
        tremolo.connect(filter);
        timbreInput = tremolo;
        voice.nodes.push(tremolo, oscillator, depth);
        trackSource(oscillator);
        oscillator.start(now);
        oscillator.stop(end);
      }
      if (preset.vibratoRate) {
        const oscillator = ctx.createOscillator();
        vibrato = ctx.createGain();
        oscillator.frequency.value = preset.vibratoRate;
        vibrato.gain.setValueAtTime(0, now);
        vibrato.gain.linearRampToValueAtTime(preset.vibratoDepth, now + 0.35);
        oscillator.connect(vibrato);
        voice.nodes.push(oscillator, vibrato);
        trackSource(oscillator);
        oscillator.start(now);
      }
      const partial = (ratio, weight, detune, tail) => {
        const pitch = frequency * ratio * Math.sqrt(1 + preset.inharmonicity * ratio * ratio);
        if (pitch > ctx.sampleRate * 0.44) return;
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = pitch;
        oscillator.detune.value = detune;
        if (vibrato) vibrato.connect(oscillator.detune);
        const gain = level * weight;
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(gain, now + preset.attack);
        if (preset.sustained) {
          envelope.gain.linearRampToValueAtTime(gain * preset.sustainLevel, now + preset.attack + 0.24);
        } else {
          const tailEnd = Math.max(preset.attack + 0.02, tail * 2.1);
          const body = Math.min(tailEnd * 0.50, 0.24 + tail * 0.10);
          envelope.gain.exponentialRampToValueAtTime(Math.max(0.00001, gain * 0.35), now + body);
          envelope.gain.exponentialRampToValueAtTime(0.00001, now + tailEnd);
        }
        oscillator.connect(envelope);
        envelope.connect(timbreInput);
        voice.nodes.push(oscillator, envelope);
        trackSource(oscillator);
        oscillator.start(now);
        if (Number.isFinite(end)) oscillator.stop(end);
      };

      preset.harmonics.forEach((weight, index) => {
        const harmonic = preset.ratios ? preset.ratios[index] : index + 1;
        const tail = decay / Math.pow(harmonic, preset.tailPower || 0.57);
        // Two slightly separated strings give the fundamental its moving, acoustic body.
        if (!preset.single && (index === 0 || preset.doublePartials)) {
          partial(harmonic, weight * 0.63, -preset.detune, tail);
          partial(harmonic, weight * 0.37, preset.detune, tail * 0.96);
        } else {
          partial(harmonic, weight, (index % 2 ? -1 : 1) * preset.detune * 0.3, tail);
        }
      });
      if (this.instrument === 'electric') partial(2.756, 0.065 * velocity, 0, 0.6);

      if (preset.air) {
        const breath = ctx.createBufferSource();
        const breathGain = ctx.createGain();
        const breathFilter = ctx.createBiquadFilter();
        breath.buffer = this._airNoise;
        breath.loop = true;
        breathFilter.type = 'bandpass';
        breathFilter.frequency.value = Math.min(5000, frequency * 5);
        breathFilter.Q.value = 0.65;
        breathGain.gain.setValueAtTime(0, now);
        breathGain.gain.linearRampToValueAtTime(level * preset.air, now + preset.attack);
        breath.connect(breathFilter);
        breathFilter.connect(breathGain);
        breathGain.connect(timbreInput);
        voice.nodes.push(breath, breathFilter, breathGain);
        trackSource(breath);
        breath.start(now);
      }

      if (preset.hammer > 0) {
        const hammer = ctx.createBufferSource();
        const hammerGain = ctx.createGain();
        hammer.buffer = this._noise;
        hammerGain.gain.value = level * preset.hammer;
        hammer.connect(hammerGain);
        hammerGain.connect(filter);
        voice.nodes.push(hammer, hammerGain);
        trackSource(hammer);
        hammer.start(now);
      }
      return voice.id;
    }

    noteOff(voiceId) {
      const voice = this.voices.get(voiceId);
      if (!voice || !voice.held) return;
      voice.held = false;
      if (!this.sustain) this._release(voice, voice.preset.release);
    }

    _release(voice, duration = 0.18) {
      const now = this.context.currentTime;
      const end = Math.max(now + 0.005, Math.min(voice.end, now + duration));
      if (voice.released && voice.releaseEnd <= end) return;
      const gain = voice.output.gain;
      if (voice.released && typeof gain.cancelAndHoldAtTime === 'function') {
        gain.cancelAndHoldAtTime(now);
      } else {
        const previous = voice.released ? gain.value : 1;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(previous, now);
      }
      voice.released = true;
      voice.releaseEnd = end;
      voice.output.gain.exponentialRampToValueAtTime(0.0001, end);
      voice.output.gain.setValueAtTime(0, end + 0.005);
      for (const source of voice.sources) {
        try { source.stop(end + 0.008); } catch (_) { /* Already naturally ended. */ }
      }
    }

    _makeRoom() {
      while (this.voices.size >= this.maxVoices) {
        const voices = [...this.voices.values()];
        const oldest = voices.find(voice => voice.released) || voices.find(voice => !voice.held) || voices[0];
        this._release(oldest, 0.01);
        // Detach from the active registry now; onended still cleans the short release tail.
        this.voices.delete(oldest.id);
        this._retiring.add(oldest);
      }
    }

    _dispose(voice) {
      this.voices.delete(voice.id);
      this._retiring.delete(voice);
      for (const node of voice.nodes) {
        try { node.disconnect(); } catch (_) { /* Already disconnected. */ }
      }
    }

    setSustain(enabled) {
      this.sustain = Boolean(enabled);
      if (!this.sustain) {
        for (const voice of this.voices.values()) {
          if (!voice.held) this._release(voice, voice.preset.release);
        }
      }
    }

    setVolume(volume) {
      this.volume = clamp(finite(volume, this.volume), 0, 1);
      if (this._ready) this._ramp(this._master.gain, this.volume);
    }

    setReverb(amount) {
      this.reverb = clamp(finite(amount, this.reverb), 0, 1);
      if (this._ready) {
        this._ramp(this._dry.gain, 1 - this.reverb * 0.18);
        this._ramp(this._wet.gain, this.reverb * 0.52);
      }
    }

    _ramp(parameter, value) {
      const now = this.context.currentTime;
      if (typeof parameter.cancelAndHoldAtTime === 'function') {
        parameter.cancelAndHoldAtTime(now);
      } else {
        const previous = parameter.value;
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(previous, now);
      }
      parameter.linearRampToValueAtTime(value, now + 0.025);
    }

    setInstrument(name) {
      if (Object.prototype.hasOwnProperty.call(PRESETS, name)) this.instrument = name;
    }

    allNotesOff() {
      this.sustain = false;
      for (const voice of new Set([...this.voices.values(), ...this._retiring])) {
        voice.held = false;
        this._release(voice, 0.012);
        this._retiring.add(voice);
      }
      this.voices.clear();
      for (const source of this._clicks) {
        try { source.stop(); } catch (_) { /* Already ended. */ }
      }
      this._clicks.clear();
    }

    tick(accent = false) {
      if (!this.context || !this._ready || this.context.state !== 'running') return;
      const ctx = this.context;
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(accent ? 1400 : 1000, now);
      oscillator.frequency.exponentialRampToValueAtTime(accent ? 1000 : 700, now + 0.022);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(accent ? 0.12 : 0.075, now + 0.002);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
      oscillator.connect(envelope);
      envelope.connect(this._limiter);
      this._clicks.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        this._clicks.delete(oscillator);
      };
      oscillator.start(now);
      oscillator.stop(now + 0.045);
    }
  }

  return { PianoAudio, INSTRUMENTS };
});
