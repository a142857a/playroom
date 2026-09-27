(function () {
  'use strict';
  const music = window.FeltMusic;
  const audio = new window.FeltAudio.PianoAudio();
  const $ = (id) => document.getElementById(id);
  const STORAGE = 'felt-piano-v1';
  const TAKE_STORAGE = 'felt-piano-take-v1';
  const MAX_RECORDING = 5 * 60 * 1000;
  const instruments = window.FeltAudio.INSTRUMENTS;
  const voices = Object.fromEntries(instruments.map(voice => [voice.id, voice]));
  const themes = new Set(['ebony', 'burgundy', 'forest', 'ivory', 'graphite', 'amethyst', 'petrol', 'copper', 'rose', 'porcelain']);
  const tracks = [...window.FeltTracks.TRACKS];
  let importIntent = 0;
  let importedCount = 0;
  let selectedTrack = tracks[0];
  let libraryPosition = 0;
  let looping = false;
  let seeking = false;
  const trackButtons = new Map();
  let octave = 4;
  let instrument = 'felt';
  let theme = 'ebony';
  let bpm = 96;
  let pedalLatch = false;
  let pedalHeld = false;
  let sustained = false;
  let recording = null;
  let savedTake = null;
  let playback = null;
  let metronome = null;
  let toastTimer;
  let beatTimer;
  let lastFrame = 0;
  let sequence = 0;
  let transportIntent = 0;
  let metronomeIntent = 0;
  const active = new Map();
  const pointers = new Map();
  const keys = new Map();
  const sounding = new Set();
  const heldCodes = new Set();
  const physicalModifiers = new Set();
  const modifierPointers = new Map();
  const latchedModifiers = new Set();
  const modifierButtons = [];
  const spaceButtons = [];
  const physicalFlags = { shift: false, ctrl: false };

  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }

  function preferences() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ octave, instrument, theme, bpm, trackId: selectedTrack.id, looping,
        volume: Number($('volume').value), reverb: Number($('reverb').value), labels: $('show-labels').checked }));
    } catch (_) { /* Audio remains usable when browser storage is unavailable. */ }
  }

  function readStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      // A damaged preference must not hide a separately stored recording.
      return null;
    }
  }

  function restore() {
    const prefs = readStoredJson(STORAGE);
    if (prefs && typeof prefs === 'object') {
      if (Number.isFinite(prefs.octave)) octave = music.clampOctave(prefs.octave);
      if (Object.hasOwn(voices, prefs.instrument)) instrument = prefs.instrument;
      if (themes.has(prefs.theme)) theme = prefs.theme;
      selectedTrack = tracks.find(track => track.id === prefs.trackId) || selectedTrack;
      looping = prefs.looping === true;
      if (Number.isFinite(prefs.bpm)) bpm = Math.max(30, Math.min(240, Math.round(prefs.bpm)));
      ['volume', 'reverb'].forEach(id => {
        if (Number.isFinite(prefs[id])) $(id).value = Math.max(0, Math.min(100, prefs[id]));
      });
      if (typeof prefs.labels === 'boolean') $('show-labels').checked = prefs.labels;
    }
    const take = readStoredJson(TAKE_STORAGE);
    if (take && Array.isArray(take.notes)) {
      const clean = music.normalizeRecording(take.notes, take.duration);
      if (clean.notes.length) savedTake = clean;
    }
  }

  async function enableAudio() {
    try {
      const available = await audio.unlock();
      if (!available) throw new Error('Audio is unavailable');
      $('audio-status').innerHTML = '<span class="status-dot"></span> Ready to play';
      $('audio-status').classList.add('ready');
      return true;
    } catch (_) {
      $('audio-status').textContent = 'Audio unavailable';
      notify('Sound could not start. Try opening Felt in Chrome or Edge.');
      return false;
    }
  }

  function buildKeyboard() {
    keys.clear();
    modifierButtons.length = 0;
    spaceButtons.length = 0;
    $('keyboard').replaceChildren();
    $('keyboard').setAttribute('aria-label', 'Computer keyboard. Number row starts at ' + music.noteName(music.keyMidi('Digit1', octave)) + ', Q row at ' + music.noteName(music.keyMidi('KeyQ', octave)) + ', A row at ' + music.noteName(music.keyMidi('KeyA', octave)) + ', Z row at ' + music.noteName(music.keyMidi('KeyZ', octave)) + '.');
    const notes = new Map(music.keyboardNotes(octave).map(note => [note.code, note]));
    const utility = (label, units = 1, kind = 'utility') => ({ label, units, kind });
    const keyWidths = { Backspace: 2, Tab: 1.5, CapsLock: 1.75, Enter: 2.25, Backslash: 1.5 };
    const noteKeys = rowId => music.KEY_ROWS.find(row => row.id === rowId).codes.map(code => ({
      label: music.KEY_LABELS[code], code, units: keyWidths[code] || 1, kind: 'note'
    }));
    const rows = [
      ['number', noteKeys('number')],
      ['upper', noteKeys('upper')],
      ['home', noteKeys('home')],
      ['lower', [utility('Shift', 2.25, 'shift'), ...noteKeys('lower'), utility('Shift', 2.75, 'shift')]],
      ['space', [utility('Ctrl', 1.5, 'ctrl'), utility('Fn', 1.25), utility('Alt', 1.25), utility('Space', 7, 'space'), utility('Alt', 1.25), utility('Fn', 1.25), utility('Ctrl', 1.5, 'ctrl')]]
    ];
    for (const [rowId, layout] of rows) {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      row.dataset.row = rowId;
      for (const item of layout) {
        const key = document.createElement('button');
        key.type = 'button';
        key.style.setProperty('--units', item.units);
        const binding = document.createElement('span');
        binding.className = 'key-binding';
        binding.textContent = item.label;
        const caption = document.createElement('span');
        caption.className = 'key-note';
        key.appendChild(binding);
        key.appendChild(caption);
        if (item.kind === 'note') {
          const note = notes.get(item.code);
          key.className = 'computer-key note-key' + (note.midi === 60 ? ' middle-c' : '');
          key.dataset.code = item.code;
          key.dataset.midi = note.midi;
          key.setAttribute('aria-pressed', 'false');
          key.addEventListener('click', event => {
            if (event.detail !== 0) return;
            const source = 'accessible-' + (++sequence);
            startNote(music.keyMidi(item.code, octave, modifiers()), source, .75, item.code);
            setTimeout(() => releaseNote(source), 400);
          });
          keys.set(item.code, key);
        } else if (item.kind === 'shift' || item.kind === 'ctrl') {
          key.className = 'computer-key modifier-key';
          key.dataset.modifier = item.kind;
          key.setAttribute('aria-label', item.label + (item.kind === 'shift' ? ': raise one semitone' : ': lower one semitone'));
          caption.textContent = item.kind === 'shift' ? '+1 semitone' : '−1 semitone';
          modifierButtons.push(key);
          key.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            key.setPointerCapture(event.pointerId);
            modifierPointers.set(event.pointerId, item.kind);
            renderNotes();
          });
          const lift = event => { modifierPointers.delete(event.pointerId); renderNotes(); };
          ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => key.addEventListener(type, lift));
          key.addEventListener('click', event => {
            if (event.detail !== 0) return;
            if (latchedModifiers.has(item.kind)) latchedModifiers.delete(item.kind); else latchedModifiers.add(item.kind);
            renderNotes();
          });
        } else if (item.kind === 'space') {
          key.className = 'computer-key space-key';
          caption.textContent = 'sustain';
          key.setAttribute('aria-label', 'Space: toggle sustain');
          key.setAttribute('aria-pressed', String(sustained));
          key.classList.toggle('active', sustained);
          key.addEventListener('click', () => { pedalLatch = !pedalLatch; updateSustain(); });
          spaceButtons.push(key);
        } else {
          key.className = 'computer-key utility-key';
          key.disabled = true;
          key.setAttribute('aria-hidden', 'true');
        }
        row.appendChild(key);
      }
      $('keyboard').appendChild(row);
    }
    $('octave-value').textContent = octave;
    $('octave-down').disabled = octave <= 2;
    $('octave-up').disabled = octave >= 5;
    $('keyboard').classList.toggle('hide-labels', !$('show-labels').checked);
    renderNotes();
  }

  function renderNotes() {
    const entries = [...active.values()].filter(note => note.started);
    const notes = new Set(entries.map(note => note.midi));
    const current = modifiers();
    const transpose = Number(current.shiftKey) - Number(current.ctrlKey);
    keys.forEach((key, code) => {
      const midi = music.keyMidi(code, octave, current);
      const struck = entries.find(note => note.code === code);
      const pressed = !!struck || entries.some(note => !note.code && note.midi === midi);
      // A held note retains the pitch it was struck with, even if a modifier is released first.
      const shownMidi = struck ? struck.midi : midi;
      key.dataset.midi = midi;
      const name = music.noteName(shownMidi, transpose < 0);
      key.querySelector('.key-note').textContent = name;
      key.setAttribute('aria-label', music.KEY_LABELS[code] + ': ' + name);
      key.classList.toggle('active', pressed);
      key.setAttribute('aria-pressed', String(pressed));
    });
    modifierButtons.forEach(key => {
      const on = key.dataset.modifier === 'shift' ? current.shiftKey : current.ctrlKey;
      key.classList.toggle('active', on);
      key.setAttribute('aria-pressed', String(on));
    });
    const display = [...notes].sort((a, b) => a - b);
    $('chord-display').textContent = display.length ? music.describeChord(display) : '';
    $('active-notes').textContent = display.map(midi => music.noteName(midi)).join('  ·  ');
  }

  function addRecordingNote(entry, source) {
    if (!recording || source.startsWith('play-')) return;
    const note = { midi: entry.midi, start: performance.now() - recording.started,
      duration: 0, velocity: entry.velocity };
    recording.open.set(entry, note);
  }

  function finishRecordingNote(entry, force = false) {
    if (!recording || (sustained && !force)) return;
    const note = recording.open.get(entry);
    if (!note) return;
    note.duration = Math.max(30, performance.now() - recording.started - note.start);
    recording.notes.push(note);
    recording.open.delete(entry);
  }

  async function startNote(midi, source, velocity = .75, code = null) {
    if (active.has(source)) return;
    const entry = { midi, velocity, code, voice: null, started: false, released: false };
    active.set(source, entry);
    if (!(await enableAudio())) { active.delete(source); return; }
    // A key can be released while the browser is unlocking its audio context.
    if (active.get(source) !== entry || entry.released) return;
    entry.voice = audio.noteOn(midi, velocity);
    if (entry.voice === null) { active.delete(source); return; }
    entry.started = true;
    addRecordingNote(entry, source);
    renderNotes();
  }

  function releaseNote(source) {
    const entry = active.get(source);
    if (!entry) return;
    entry.released = true;
    if (entry.started) {
      audio.noteOff(entry.voice);
      finishRecordingNote(entry);
      if (sustained) sounding.add(entry);
    }
    active.delete(source);
    renderNotes();
  }

  function updateSustain() {
    const next = pedalLatch || pedalHeld;
    if (sustained && !next) {
      sustained = false;
      sounding.forEach(entry => finishRecordingNote(entry, true));
      sounding.clear();
    } else sustained = next;
    audio.setSustain(sustained);
    $('sustain-button').setAttribute('aria-pressed', String(sustained));
    spaceButtons.forEach(key => { key.classList.toggle('active', sustained); key.setAttribute('aria-pressed', String(sustained)); });
  }

  function releaseAll() {
    pedalHeld = false;
    pedalLatch = false;
    updateSustain();
    [...active.keys()].forEach(releaseNote);
    sounding.clear();
    pointers.clear();
    heldCodes.clear();
    physicalModifiers.clear();
    modifierPointers.clear();
    latchedModifiers.clear();
    physicalFlags.shift = false;
    physicalFlags.ctrl = false;
    audio.allNotesOff();
    renderNotes();
  }

  function changeOctave(delta) {
    releaseAll();
    octave = music.clampOctave(octave + delta);
    buildKeyboard();
    preferences();
  }

  function selectVoice(voice) {
    instrument = voice;
    audio.setInstrument(voice);
    document.querySelectorAll('[data-voice]').forEach(button => {
      const selected = button.dataset.voice === voice;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    preferences();
  }

  function selectTheme(value) {
    theme = themes.has(value) ? value : 'ebony';
    document.documentElement.dataset.theme = theme;
    $('current-theme-name').textContent = theme[0].toUpperCase() + theme.slice(1);
    $('current-theme-swatch').className = 'theme-swatch swatch-' + theme;
    $('theme-picker').open = false;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      const selected = button.dataset.themeChoice === theme;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    preferences();
  }

  function renderWave(notes = [], progress = 0, live = false) {
    const count = 44;
    const duration = recording ? Math.max(4000, performance.now() - recording.started) : (savedTake?.duration || 1);
    const heights = Array(count).fill(3);
    notes.forEach(note => {
      const at = Math.min(count - 1, Math.floor(note.start / duration * count));
      heights[at] = Math.max(heights[at], 9 + (note.midi % 19) * 1.6);
    });
    const fragment = document.createDocumentFragment();
    heights.forEach((height, i) => {
      const bar = document.createElement('span');
      bar.className = 'wave-bar' + (i / count < progress || live ? ' passed' : '');
      bar.style.height = height + 'px';
      fragment.appendChild(bar);
    });
    $('session-wave').replaceChildren(fragment);
  }

  function updateSession() {
    const hasTake = !!savedTake?.notes.length;
    $('record-button').classList.toggle('recording', !!recording);
    $('record-label').textContent = recording ? 'Stop' : 'Record';
    $('record-button').setAttribute('aria-label', recording ? 'Stop recording' : 'Start recording');
    $('session-tag').textContent = recording ? 'Recording' : playback?.type === 'take' ? 'Playback' : hasTake ? 'Saved' : '';
    $('playback-button').disabled = !hasTake || !!recording;
    $('export-button').disabled = !hasTake || !!recording;
    const playingTake = playback?.type === 'take';
    $('playback-button').innerHTML = '<svg class="icon"><use href="#i-' + (playingTake ? 'stop' : 'play') + '"/></svg><span>' + (playingTake ? 'Stop' : 'Play back') + '</span>';
    if (!recording && !playingTake) {
      $('session-time').textContent = music.formatTime(savedTake?.duration || 0);
      renderWave(savedTake?.notes || []);
    }
  }

  async function startRecording() {
    stopPlayback();
    releaseAll();
    const intent = ++transportIntent;
    if (!(await enableAudio()) || recording || intent !== transportIntent) return;
    recording = { started: performance.now(), notes: [], open: new Map() };
    updateSession();
  }

  function stopRecording() {
    transportIntent++;
    if (!recording) return;
    for (const entry of recording.open.keys()) finishRecordingNote(entry, true);
    const take = music.normalizeRecording(recording.notes, Math.min(MAX_RECORDING, performance.now() - recording.started));
    recording = null;
    if (take.notes.length) {
      savedTake = take;
      let stored = false;
      try { localStorage.setItem(TAKE_STORAGE, JSON.stringify(take)); stored = true; } catch (_) { /* Export is still available. */ }
      notify(stored ? 'Recording saved.' : 'Recording ready. Save MIDI to keep it.');
    } else {
      notify(savedTake ? 'No notes recorded. Previous take kept.' : 'No notes recorded.');
    }
    updateSession();
  }

  function clearPlaybackTimers() {
    if (!playback) return;
    playback.timers.forEach(clearTimeout);
    playback.timers = [];
  }

  function stopPlayback() {
    transportIntent++;
    clearPlaybackTimers();
    playback = null;
    libraryPosition = 0;
    releasePlaybackNotes();
    updateLibrary();
    updateSession();
  }

  function releasePlaybackNotes() {
    // Transport controls stop their own notes while keeping live, held keys playable.
    audio.setSustain(false);
    [...active.keys()].filter(source => source.startsWith('play-')).forEach(releaseNote);
    audio.setSustain(sustained);
  }

  async function playSequence(take, type, offset = 0) {
    stopRecording();
    stopPlayback();
    releaseAll();
    const intent = ++transportIntent;
    if (!(await enableAudio()) || intent !== transportIntent) return;
    const token = ++sequence;
    const position = Math.max(0, Math.min(take.duration - 1, offset));
    if (type === 'demo') libraryPosition = position;
    playback = { type, take, token, paused: false, started: performance.now() - position, duration: take.duration, timers: [] };
    take.notes.forEach((note, i) => {
      if (note.start + note.duration <= position) return;
      const source = 'play-' + token + '-' + i;
      playback.timers.push(setTimeout(() => {
        if (playback?.token === token) startNote(note.midi, source, note.velocity);
      }, Math.max(0, note.start - position)));
      playback.timers.push(setTimeout(() => releaseNote(source), note.start + note.duration - position));
    });
    playback.timers.push(setTimeout(() => {
      if (playback?.token !== token) return;
      if (type === 'demo' && looping) playSequence(take, type);
      else stopPlayback();
    }, take.duration - position + 60));
    updateLibrary();
    updateSession();
  }

  function buildLibrary() {
    $('track-list').replaceChildren();
    trackButtons.clear();
    tracks.forEach((track, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'track-card';
      button.dataset.track = track.id;
      button.setAttribute('aria-label', 'Play ' + track.title + ' by ' + track.composer);
      const number = document.createElement('span'); number.className = 'track-number'; number.textContent = String(index + 1).padStart(2, '0');
      const info = document.createElement('span'); info.className = 'track-info';
      const title = document.createElement('strong'); title.textContent = track.title;
      const composer = document.createElement('span'); composer.textContent = track.composer;
      info.appendChild(title); info.appendChild(composer);
      const duration = document.createElement('span'); duration.className = 'track-duration'; duration.textContent = music.formatTime(track.duration);
      const play = document.createElement('span'); play.className = 'track-play'; play.textContent = '▶'; play.setAttribute('aria-hidden', 'true');
      button.appendChild(number); button.appendChild(info); button.appendChild(duration); button.appendChild(play);
      button.addEventListener('click', () => {
        if (selectedTrack.id === track.id && playback?.type === 'demo') toggleLibrary();
        else {
          selectedTrack = track;
          libraryPosition = 0;
          preferences();
          updateLibrary();
          playSequence(track, 'demo');
        }
      });
      trackButtons.set(track.id, button);
      $('track-list').appendChild(button);
    });
    updateLibrary();
  }

  async function importMidi() {
    const file = $('midi-file').files?.[0];
    if (!file) return;
    const intent = ++importIntent;
    $('import-status').textContent = 'Reading MIDI…';
    try {
      if (file.size > window.FeltMidi.MAX_BYTES) throw new Error('Choose a MIDI file smaller than 2 MB.');
      const bytes = await file.arrayBuffer();
      if (intent !== importIntent) return;
      const score = window.FeltMidi.parseMidi(bytes, file.name);
      const track = { ...score, id: 'import-' + (++importedCount), composer: 'Your MIDI', key: 'Local arrangement', imported: true };
      stopPlayback();
      tracks.push(track); selectedTrack = track; libraryPosition = 0;
      buildLibrary(); preferences();
      $('import-status').textContent = 'Imported: ' + track.title;
    } catch (error) {
      if (intent === importIntent) $('import-status').textContent = error.message || 'Could not read this MIDI file.';
    } finally { if (intent === importIntent) $('midi-file').value = ''; }
  }

  function updateLibraryProgress() {
    const position = playback?.type === 'demo' && !playback.paused ? Math.min(playback.duration, performance.now() - playback.started) : libraryPosition;
    if (!seeking) {
      $('track-progress').value = Math.round(position / selectedTrack.duration * 1000);
      $('track-current-time').textContent = music.formatTime(position);
      $('track-progress').setAttribute('aria-valuetext', music.formatTime(position) + ' of ' + music.formatTime(selectedTrack.duration));
    }
  }

  function updateLibrary() {
    const playing = playback?.type === 'demo' && !playback.paused;
    const paused = playback?.type === 'demo' && playback.paused;
    trackButtons.forEach((button, id) => {
      button.classList.toggle('selected', id === selectedTrack.id);
      button.classList.toggle('playing', id === selectedTrack.id && playing);
      button.setAttribute('aria-pressed', String(id === selectedTrack.id));
    });
    $('library-now-title').textContent = selectedTrack.title;
    $('library-now-composer').textContent = selectedTrack.composer + ' · ' + selectedTrack.key;
    $('library-player-state').textContent = playing ? 'NOW PLAYING' : paused ? 'PAUSED' : 'READY TO PLAY';
    $('track-duration').textContent = music.formatTime(selectedTrack.duration);
    $('track-toggle-label').textContent = playing ? 'Pause' : paused || libraryPosition > 0 ? 'Resume' : selectedTrack.imported ? 'Play MIDI' : selectedTrack.category === 'opera' ? 'Play aria' : 'Play piece';
    $('track-toggle').setAttribute('aria-label', playing ? 'Pause example track' : paused || libraryPosition > 0 ? 'Resume example track' : 'Play example track');
    $('track-toggle').querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('track-loop').setAttribute('aria-pressed', String(looping));
    updateLibraryProgress();
  }

  function toggleLibrary() {
    if (playback?.type === 'demo' && !playback.paused) {
      transportIntent++;
      libraryPosition = Math.min(playback.duration, performance.now() - playback.started);
      clearPlaybackTimers();
      playback.paused = true;
      releasePlaybackNotes();
      updateLibrary();
    } else playSequence(selectedTrack, 'demo', libraryPosition >= selectedTrack.duration ? 0 : libraryPosition);
  }

  function seekLibrary() {
    seeking = false;
    const position = Math.max(0, Math.min(1000, Number($('track-progress').value))) / 1000 * selectedTrack.duration;
    const playing = playback?.type === 'demo' && !playback.paused;
    libraryPosition = position;
    if (playing) playSequence(selectedTrack, 'demo', position);
    else updateLibrary();
    $('track-progress').blur();
  }

  function exportMidi() {
    if (!savedTake) return;
    const bytes = music.encodeMidi(savedTake, bpm);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'felt-session-' + new Date().toISOString().slice(0, 10) + '.mid';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify('MIDI saved.');
  }

  function setTempo(value) {
    const number = Number(value);
    bpm = Number.isFinite(number) ? Math.max(30, Math.min(240, Math.round(number))) : 96;
    $('tempo').value = bpm;
    preferences();
  }

  function updateMixControl(id) {
    const value = Number($(id).value);
    $(id + '-value').textContent = value + '%';
    audio[id === 'volume' ? 'setVolume' : 'setReverb'](value / 100);
  }

  function stopMetronome() {
    metronomeIntent++;
    if (metronome) clearTimeout(metronome.timer);
    metronome = null;
    clearTimeout(beatTimer);
    $('beat-light').classList.remove('beat');
    $('metronome-button').setAttribute('aria-pressed', 'false');
    $('metronome-button').lastElementChild.textContent = 'Start metronome';
  }

  async function startMetronome() {
    const intent = ++metronomeIntent;
    if (!(await enableAudio()) || metronome || intent !== metronomeIntent) return;
    metronome = { timer: null, beat: 0, next: performance.now() };
    $('metronome-button').setAttribute('aria-pressed', 'true');
    $('metronome-button').lastElementChild.textContent = 'Stop metronome';
    function tick() {
      if (!metronome) return;
      audio.tick(metronome.beat % 4 === 0);
      metronome.beat++;
      $('beat-light').classList.add('beat');
      clearTimeout(beatTimer);
      beatTimer = setTimeout(() => $('beat-light').classList.remove('beat'), 90);
      metronome.next = Math.max(metronome.next, performance.now() - 100) + 60000 / bpm;
      metronome.timer = setTimeout(tick, Math.max(0, metronome.next - performance.now()));
    }
    tick();
  }

  function stopEverything() {
    stopRecording();
    stopPlayback();
    stopMetronome();
    releaseAll();
  }

  function editable(target) {
    return target && (target.isContentEditable || target.matches('textarea,select,input:not([type="range"]):not([type="checkbox"])'));
  }

  function modifiers() {
    const touch = [...modifierPointers.values()];
    return {
      shiftKey: physicalFlags.shift || latchedModifiers.has('shift') || touch.includes('shift'),
      ctrlKey: physicalFlags.ctrl || latchedModifiers.has('ctrl') || touch.includes('ctrl')
    };
  }

  function syncModifiers(event, down) {
    if (/^(Shift|Control)(Left|Right)$/.test(event.code || '')) {
      if (down) physicalModifiers.add(event.code); else physicalModifiers.delete(event.code);
    }
    for (const [name, flag, prefix] of [['shift', 'shiftKey', 'Shift'], ['ctrl', 'ctrlKey', 'Control']]) {
      if (event[flag] === false) {
        [...physicalModifiers].filter(code => code.startsWith(prefix)).forEach(code => physicalModifiers.delete(code));
      }
      physicalFlags[name] = typeof event[flag] === 'boolean' ? event[flag] : [...physicalModifiers].some(code => code.startsWith(prefix));
    }
    renderNotes();
  }

  document.addEventListener('keydown', event => {
    if (event.code === 'Pause') { event.preventDefault(); stopEverything(); return; }
    if (editable(event.target) || event.metaKey || event.altKey) return;
    // Leave controls reachable and activatable when navigating the page by keyboard.
    // Pointer piano gestures return focus to the page, where Tab and Enter play notes.
    if ((event.code === 'Tab' || event.code === 'Enter') && event.target.closest('button,input,textarea,select,a,summary')) return;
    syncModifiers(event, true);
    if (/^(Shift|Control)(Left|Right)$/.test(event.code)) { event.preventDefault(); return; }
    if (event.code === 'Space') {
      // Preserve ordinary keyboard activation for controls and accessible piano keys.
      if (event.target.closest('button,input,summary')) return;
      event.preventDefault();
      pedalHeld = true;
      updateSustain();
      return;
    }
    if (event.code === 'PageDown' || event.code === 'PageUp') {
      if (event.target.closest('input')) return;
      event.preventDefault();
      if (!event.repeat) changeOctave(event.code === 'PageDown' ? -1 : 1);
      return;
    }
    if (Object.hasOwn(music.KEY_OFFSETS, event.code)) {
      event.preventDefault();
      if (event.repeat || heldCodes.has(event.code)) return;
      heldCodes.add(event.code);
      startNote(music.keyMidi(event.code, octave, modifiers()), 'key-' + event.code, .75, event.code);
    }
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'Space' && pedalHeld) { event.preventDefault(); pedalHeld = false; updateSustain(); }
    heldCodes.delete(event.code);
    releaseNote('key-' + event.code);
    syncModifiers(event, false);
  });

  function keyAtPoint(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('.note-key');
    return element && $('keyboard').contains(element) ? element.dataset.code : null;
  }

  $('keyboard').addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const code = keyAtPoint(event);
    if (code === null) return;
    event.preventDefault();
    syncModifiers(event);
    document.activeElement?.blur();
    $('keyboard').setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, code);
    startNote(music.keyMidi(code, octave, modifiers()), 'pointer-' + event.pointerId, event.pointerType === 'pen' && event.pressure ? .35 + event.pressure * .6 : .75, code);
  });
  $('keyboard').addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const code = keyAtPoint(event);
    if (code === pointers.get(event.pointerId)) return;
    releaseNote('pointer-' + event.pointerId);
    pointers.set(event.pointerId, code);
    if (code !== null) {
      syncModifiers(event);
      startNote(music.keyMidi(code, octave, modifiers()), 'pointer-' + event.pointerId, .75, code);
    }
  });
  function releasePointer(event) {
    releaseNote('pointer-' + event.pointerId);
    pointers.delete(event.pointerId);
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => $('keyboard').addEventListener(type, releasePointer));
  // Keep Ctrl+click available as a note gesture.
  $('keyboard').addEventListener('contextmenu', event => { if (event.ctrlKey) event.preventDefault(); });

  // Mouse/touch controls relinquish focus so Space is immediately available as a pedal.
  document.addEventListener('click', event => {
    const picker = $('theme-picker');
    if (picker.open && !picker.contains(event.target)) picker.open = false;
    if (event.detail > 0 && event.target.closest('button')) event.target.closest('button').blur();
  });
  $('sustain-button').addEventListener('click', () => { pedalLatch = !pedalLatch; updateSustain(); });
  $('stop-button').addEventListener('click', stopEverything);
  $('octave-down').addEventListener('click', () => changeOctave(-1));
  $('octave-up').addEventListener('click', () => changeOctave(1));
  $('show-labels').addEventListener('change', () => { $('keyboard').classList.toggle('hide-labels', !$('show-labels').checked); preferences(); });
  document.querySelectorAll('[data-voice]').forEach(button => button.addEventListener('click', () => selectVoice(button.dataset.voice)));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', event => {
    selectTheme(button.dataset.themeChoice);
    if (event.detail === 0) $('theme-picker').querySelector('summary').focus();
  }));
  ['volume', 'reverb'].forEach(id => {
    $(id).addEventListener('input', () => {
      updateMixControl(id);
      preferences();
    });
    $(id).addEventListener('change', event => event.target.blur());
  });
  $('record-button').addEventListener('click', () => recording ? stopRecording() : startRecording());
  $('playback-button').addEventListener('click', () => playback?.type === 'take' ? stopPlayback() : savedTake && playSequence(savedTake, 'take'));
  $('track-toggle').addEventListener('click', toggleLibrary);
  $('midi-file').addEventListener('change', importMidi);
  $('track-loop').addEventListener('click', () => { looping = !looping; preferences(); updateLibrary(); });
  $('track-progress').addEventListener('input', () => {
    seeking = true;
    $('track-current-time').textContent = music.formatTime(Number($('track-progress').value) / 1000 * selectedTrack.duration);
  });
  $('track-progress').addEventListener('change', seekLibrary);
  $('export-button').addEventListener('click', exportMidi);
  $('tempo').addEventListener('change', event => setTempo(event.target.value));
  $('tempo-down').addEventListener('click', () => setTempo(bpm - 4));
  $('tempo-up').addEventListener('click', () => setTempo(bpm + 4));
  $('metronome-button').addEventListener('click', () => metronome ? stopMetronome() : startMetronome());
  window.addEventListener('blur', stopEverything);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopEverything(); });
  window.addEventListener('pagehide', stopEverything);

  function frame(now) {
    if (now - lastFrame > 100) {
      lastFrame = now;
      if (playback?.type === 'demo' && !playback.paused) updateLibraryProgress();
      if (recording) {
        const elapsed = now - recording.started;
        $('session-time').textContent = music.formatTime(elapsed);
        renderWave([...recording.notes, ...recording.open.values()], 1, true);
        if (elapsed >= MAX_RECORDING || recording.notes.length >= 5000) { stopRecording(); }
      } else if (playback?.type === 'take') {
        const elapsed = now - playback.started;
        $('session-time').textContent = music.formatTime(elapsed);
        renderWave(savedTake.notes, elapsed / playback.duration);
      }
    }
    requestAnimationFrame(frame);
  }

  restore();
  buildLibrary();
  buildKeyboard();
  selectVoice(instrument);
  selectTheme(theme);
  $('tempo').value = bpm;
  ['volume', 'reverb'].forEach(updateMixControl);
  updateSession();
  requestAnimationFrame(frame);
}());
