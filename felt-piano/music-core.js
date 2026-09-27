(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FeltMusic = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const KEY_ROWS = Object.freeze([
    { id: 'number', codes: ['Escape', ...[...'1234567890'].map(digit => 'Digit' + digit), 'Minus', 'Equal', 'Backspace'] },
    { id: 'upper', codes: ['Tab', ...[...'QWERTYUIOP'].map(letter => 'Key' + letter), 'BracketLeft', 'BracketRight', 'Backslash'] },
    { id: 'home', codes: ['CapsLock', ...[...'ASDFGHJKL'].map(letter => 'Key' + letter), 'Semicolon', 'Quote', 'Enter'] },
    { id: 'lower', codes: [...'ZXCVBNM'].map(letter => 'Key' + letter).concat('Comma', 'Period', 'Slash') }
  ].map(row => Object.freeze({ id: row.id, codes: Object.freeze(row.codes) })));
  const NATURAL_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
  const KEY_OFFSETS = Object.freeze(Object.fromEntries(KEY_ROWS.flatMap((row, rowIndex) => {
    // Keep each existing C key anchored as extra physical keys extend its row.
    const cIndex = row.codes.indexOf(['Digit1', 'KeyQ', 'KeyA', 'KeyZ'][rowIndex]);
    return row.codes.map((code, index) => {
      const step = index - cIndex;
      return [code, (2 - rowIndex) * 12 + Math.floor(step / 7) * 12 + NATURAL_OFFSETS[((step % 7) + 7) % 7]];
    });
  })));
  const SYMBOL_LABELS = { Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps lock', Enter: 'Enter', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  const KEY_LABELS = Object.freeze(Object.fromEntries(KEY_ROWS.flatMap(row => row.codes.map(code => [code, SYMBOL_LABELS[code] || code.replace(/^(Key|Digit)/, '')]))));
  const PITCHES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_PITCHES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MAX_DURATION = 600000;
  const MAX_NOTES = 20000;
  const pitchClass = midi => ((midi % 12) + 12) % 12;

  function noteName(midi, preferFlats = false) {
    return (preferFlats ? FLAT_PITCHES : PITCHES)[pitchClass(midi)] + (Math.floor(midi / 12) - 1);
  }

  function isBlack(midi) {
    return [1, 3, 6, 8, 10].includes(pitchClass(midi));
  }

  function clampOctave(octave) {
    return Math.max(2, Math.min(5, Number.isFinite(Number(octave)) ? Math.round(Number(octave)) : 4));
  }

  function keyboardNotes(baseOctave = 4, transpose = 0) {
    const base = (clampOctave(baseOctave) + 1) * 12;
    return KEY_ROWS.flatMap(row => row.codes.map(code => {
      const midi = base + KEY_OFFSETS[code] + transpose;
      return { midi, name: noteName(midi, transpose < 0), code, keyLabel: KEY_LABELS[code], row: row.id };
    }));
  }

  function keyMidi(code, baseOctave = 4, { shiftKey = false, ctrlKey = false } = {}) {
    const offset = KEY_OFFSETS[code];
    if (typeof offset !== 'number') return null;
    return (clampOctave(baseOctave) + 1) * 12 + offset + (shiftKey ? 1 : 0) - (ctrlKey ? 1 : 0);
  }

  function formatTime(milliseconds) {
    const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  const CHORDS = [
    [[0, 4, 7], ' major'], [[0, 3, 7], ' minor'], [[0, 3, 6], ' diminished'],
    [[0, 4, 8], ' augmented'], [[0, 2, 7], 'sus2'], [[0, 5, 7], 'sus4'],
    [[0, 4, 7, 11], 'maj7'], [[0, 3, 7, 10], 'm7'], [[0, 4, 7, 10], '7'],
    [[0, 3, 6, 10], 'm7♭5'], [[0, 3, 6, 9], 'dim7'], [[0, 3, 7, 11], 'm(maj7)']
  ];

  function describeChord(midis) {
    const notes = [...new Set((Array.isArray(midis) ? midis : []).filter(midi => Number.isInteger(midi) && midi >= 0 && midi <= 127))].sort((a, b) => a - b);
    if (!notes.length) return 'Make a little music';
    const classes = [...new Set(notes.map(pitchClass))];
    const bass = pitchClass(notes[0]);
    // Trying the bass first gives symmetric chords a stable, intuitive spelling.
    for (const root of classes) {
      const intervals = classes.map(pc => pitchClass(pc - root)).sort((a, b) => a - b);
      const match = CHORDS.find(([pattern]) => pattern.length === intervals.length && pattern.every((value, index) => intervals[index] === value));
      if (match) return PITCHES[root] + match[1] + (root === bass ? '' : ' / ' + PITCHES[bass]);
    }
    return notes.map(midi => noteName(midi)).join(' · ');
  }

  function normalizeRecording(inputNotes, requestedDuration) {
    const notes = [];
    for (const input of (Array.isArray(inputNotes) ? inputNotes : []).slice(0, MAX_NOTES)) {
      if (!input || !Number.isInteger(input.midi) || input.midi < 0 || input.midi > 127 ||
          !Number.isFinite(input.start) || input.start < 0 || input.start >= MAX_DURATION ||
          !Number.isFinite(input.duration) || input.duration <= 0) continue;
      const start = Math.round(input.start);
      if (start >= MAX_DURATION) continue;
      const duration = Math.max(1, Math.min(Math.round(input.duration), MAX_DURATION - start));
      const velocity = Number.isFinite(input.velocity) ? Math.max(0.01, Math.min(1, input.velocity)) : 0.75;
      notes.push({ midi: input.midi, start, duration, velocity });
    }
    notes.sort((a, b) => a.start - b.start || a.midi - b.midi || a.duration - b.duration);
    const end = notes.reduce((latest, note) => Math.max(latest, note.start + note.duration), 0);
    const duration = Math.max(end, Math.min(MAX_DURATION, Math.max(0, Math.round(Number.isFinite(requestedDuration) ? requestedDuration : 0))));
    return { version: 1, name: 'Untitled session', duration, notes };
  }

  function variableLength(value) {
    let number = Math.max(0, Math.round(value));
    const bytes = [number & 127];
    while ((number = Math.floor(number / 128)) > 0) bytes.unshift((number & 127) | 128);
    return bytes;
  }

  function encodeMidi(recording, requestedBpm = 96) {
    const normalized = normalizeRecording(recording && recording.notes, recording && recording.duration);
    const bpm = Math.max(30, Math.min(300, Number.isFinite(requestedBpm) ? requestedBpm : 96));
    const tempo = Math.round(60000000 / bpm);
    const ticks = milliseconds => Math.round(milliseconds * 1000 * 480 / tempo);
    const events = [];
    normalized.notes.forEach(note => {
      const start = ticks(note.start);
      events.push({ time: start, order: 1, midi: note.midi, bytes: [0x90, note.midi, Math.max(1, Math.round(note.velocity * 127))] });
      events.push({ time: Math.max(start + 1, ticks(note.start + note.duration)), order: 0, midi: note.midi, bytes: [0x80, note.midi, 0] });
    });
    events.sort((a, b) => a.time - b.time || a.order - b.order || a.midi - b.midi);
    const track = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xc0, 0];
    let previousTime = 0;
    for (const event of events) {
      track.push(...variableLength(event.time - previousTime), ...event.bytes);
      previousTime = event.time;
    }
    track.push(...variableLength(Math.max(0, ticks(normalized.duration) - previousTime)), 0xff, 0x2f, 0);
    const size = track.length;
    return Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
      0x4d, 0x54, 0x72, 0x6b, (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255,
      ...track
    ]);
  }

  return Object.freeze({ KEY_ROWS, KEY_OFFSETS, KEY_LABELS, noteName, isBlack, keyboardNotes, keyMidi, clampOctave, formatTime, describeChord, normalizeRecording, encodeMidi });
});
