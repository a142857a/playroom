(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FeltMidi = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX_BYTES = 2 * 1024 * 1024;
  const MAX_DURATION = 600000;
  const MAX_NOTES = 20000;

  // Standard MIDI File formats 0/1 with PPQN timing. Everything stays local.
  function parseMidi(input, name = 'Imported MIDI') {
    const data = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    if (!data.length || data.length > MAX_BYTES) throw new Error('Choose a MIDI file smaller than 2 MB.');
    let pos = 0;
    let limit = data.length;
    function need(count) { if (pos + count > limit) throw new Error('This MIDI file is incomplete or damaged.'); }
    function byte() { need(1); return data[pos++]; }
    function number(count) { let value = 0; while (count--) value = value * 256 + byte(); return value; }
    function tag() { need(4); return String.fromCharCode(byte(), byte(), byte(), byte()); }
    function variable() {
      let value = 0;
      for (let i = 0; i < 4; i++) { const b = byte(); value = value * 128 + (b & 127); if (!(b & 128)) return value; }
      throw new Error('This MIDI file contains an invalid event time.');
    }
    function skip(count) { need(count); pos += count; }
    if (tag() !== 'MThd') throw new Error('Choose a standard .mid or .midi file.');
    const headerSize = number(4);
    if (headerSize < 6) throw new Error('This MIDI header is invalid.');
    need(headerSize);
    const format = number(2), trackCount = number(2), division = number(2);
    if (format > 1) throw new Error('Use a format 0 or 1 MIDI file. Format 2 is not supported.');
    if (!trackCount || trackCount > 128 || (format === 0 && trackCount !== 1)) throw new Error('This MIDI file has an unsupported track count.');
    if (!division || division & 0x8000) throw new Error('Use a MIDI file with musical beat timing (PPQN).');
    skip(headerSize - 6);
    const events = [];
    let eventCount = 0;
    for (let track = 0; track < trackCount; track++) {
      if (tag() !== 'MTrk') throw new Error('A MIDI track is missing or damaged.');
      const length = number(4); need(length);
      const end = pos + length; limit = end;
      let tick = 0, running = 0;
      while (pos < end) {
        if (++eventCount > 100000) throw new Error('This MIDI is too complex. Choose a smaller arrangement.');
        tick += variable();
        let status = byte();
        if (status < 128) {
          if (!running) throw new Error('This MIDI contains an invalid running status.');
          pos--; status = running;
        } else if (status < 240) running = status;
        else running = 0;
        if (status === 255) {
          const type = byte(), size = variable(); need(size);
          if (type === 81) {
            if (size !== 3) throw new Error('This MIDI contains an invalid tempo.');
            const tempo = number(3);
            if (!tempo) throw new Error('This MIDI contains an invalid tempo.');
            events.push({ tick, type: 'tempo', tempo });
          } else {
            if (type === 47 && size !== 0) throw new Error('This MIDI contains an invalid track ending.');
            skip(size);
            if (type === 47) { pos = end; break; }
          }
        } else if (status === 240 || status === 247) skip(variable());
        else if (status >= 128 && status < 240) {
          const kind = status >> 4, channel = status & 15;
          const a = byte(), b = kind === 12 || kind === 13 ? 0 : byte();
          if (a > 127 || b > 127) throw new Error('This MIDI contains invalid note data.');
          if (channel !== 9 && (kind === 8 || kind === 9 || kind === 11)) {
            events.push({ tick, track, channel, type: kind === 11 ? 'control' : kind === 8 || b === 0 ? 'off' : 'on', a, b });
          }
        } else throw new Error('This MIDI contains an unsupported event.');
      }
      events.push({ tick, type: 'end', track });
      pos = end; limit = data.length;
    }
    events.sort((a, b) => a.tick - b.tick);
    let lastTick = 0, ms = 0, tempo = 500000, firstTempo = null, totalNotes = 0;
    const notes = [], held = new Map(), active = new Set(), pedals = new Set();
    function finish(note) {
      if (!active.delete(note)) return;
      notes.push({ midi: note.midi, start: Math.round(note.start), duration: Math.max(1, Math.round(ms) - Math.round(note.start)), velocity: note.velocity });
    }
    for (const event of events) {
      ms += (event.tick - lastTick) * tempo / division / 1000; lastTick = event.tick;
      if (ms > MAX_DURATION) throw new Error('Choose an arrangement no longer than 10 minutes.');
      if (event.type === 'tempo') { tempo = event.tempo; if (firstTempo === null) firstTempo = tempo; continue; }
      const key = event.track + ':' + event.channel + ':' + event.a;
      if (event.type === 'on') {
        if (++totalNotes > MAX_NOTES) throw new Error('Choose an arrangement with fewer than 20,000 notes.');
        const note = { midi: event.a, start: ms, velocity: event.b / 127, channel: event.channel, track: event.track, down: true };
        if (!held.has(key)) held.set(key, []);
        held.get(key).push(note); active.add(note);
      } else if (event.type === 'off') {
        const note = held.get(key)?.shift();
        if (note) { note.down = false; if (!pedals.has(event.channel)) finish(note); }
      } else if (event.type === 'control') {
        if (event.a === 64) {
          if (event.b >= 64) pedals.add(event.channel);
          else { pedals.delete(event.channel); for (const note of active) if (note.channel === event.channel && !note.down) finish(note); }
        } else if (event.a === 120 || event.a === 123) {
          for (const note of active) if (note.channel === event.channel) {
            note.down = false;
            if (event.a === 120 || !pedals.has(event.channel)) finish(note);
          }
          for (const [id, queue] of held) if (queue[0]?.channel === event.channel) held.delete(id);
        } else if (event.a === 121) {
          pedals.delete(event.channel);
          for (const note of active) if (note.channel === event.channel && !note.down) finish(note);
        }
      }
    }
    for (const note of active) finish(note);
    if (!notes.length) throw new Error('No pitched notes were found. Drum-only files are not supported.');
    notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    const end = notes.reduce((value, note) => Math.max(value, note.start + note.duration), 0);
    return { title: String(name).replace(/\.midi?$/i, '').slice(0, 100) || 'Imported MIDI',
      bpm: Math.round(60000000 / (firstTempo || 500000)), duration: Math.max(1, Math.round(ms), end), notes };
  }
  return Object.freeze({ parseMidi, MAX_BYTES });
});
