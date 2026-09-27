// Four original 32-bar scores, each with an eight-bar theme, answer, bridge and reprise.
// Pitches are semitones above the root. Nulls leave room between phrases.
export const MUSIC_TRACKS = [
  {
    id:1, sectors:[1,2,3], title:'First Light', bpm:96, root:50,
    lead:'flute', counter:'pluck', color:2050, swing:.22,
    rhythm:{bass:[0,7,10],kick:[0,10],snare:[8],hat:[2,6,10,14],rim:[5,13]},
    chords:[[0,4,7,11],[9,12,16,19],[5,9,12,16],[7,11,14,17],[2,5,9,12],[4,7,11,14]],
    harmony:[0,1,2,3,0,5,4,3, 2,3,1,5,2,4,3,3, 1,5,2,0,4,1,2,3, 0,1,2,3,4,2,3,0],
    theme:[
      0,null,4,7,9,7,4,null, 9,null,7,4,2,null,4,null,
      5,null,9,12,9,7,5,null, 7,null,11,14,12,11,7,null,
      4,7,9,null,12,11,9,7, 4,null,7,11,9,7,4,null,
      2,null,5,9,7,null,5,2, 7,11,14,null,11,7,4,null,
    ],
    answer:[
      12,null,9,5,9,12,14,null, 14,12,11,null,7,11,14,null,
      16,null,12,9,12,16,14,12, 11,null,7,4,7,null,9,11,
      12,9,5,null,9,12,9,7, 9,null,5,2,5,9,12,null,
      11,14,17,14,11,null,7,4, 2,null,4,7,11,7,4,null,
    ],
    bridge:[
      9,null,null,12,16,null,12,null, 11,null,7,null,4,null,null,null,
      5,null,null,9,12,null,9,null, 7,null,4,null,0,null,null,null,
      2,null,5,null,9,null,5,null, 9,null,12,null,16,null,12,null,
      12,null,9,null,5,null,null,null, 7,null,11,null,14,null,11,null,
    ],
    counterline:[0,7,12,7,9,12,16,12,5,9,12,9,7,11,14,11,4,7,12,7,4,7,11,7,2,5,9,5,7,11,14,7],
  },
  {
    id:2, sectors:[4,5,6], title:'Iron River', bpm:108, root:48,
    lead:'reed', counter:'mallet', color:1500, swing:0,
    rhythm:{bass:[0,4,6,8,12,14],kick:[0,6,8,14],snare:[4,12],hat:[2,6,10,14],rim:[7,15]},
    chords:[[0,3,7,10],[8,12,15,19],[5,8,12,15],[7,11,14,17],[3,7,10,14],[1,5,8,12]],
    harmony:[0,0,1,3,0,2,5,3, 2,1,4,3,5,2,1,3, 5,2,0,0,4,1,2,3, 0,0,1,3,2,5,3,0],
    theme:[
      0,0,null,7,3,null,0,null, 0,0,null,10,7,3,2,null,
      8,8,null,12,15,null,12,8, 7,7,null,11,14,11,7,null,
      0,3,7,null,10,7,3,0, 5,5,null,8,12,8,5,null,
      1,1,null,5,8,7,5,1, 7,11,14,17,14,11,7,null,
    ],
    answer:[
      12,12,8,null,5,8,12,null, 15,15,12,null,8,12,15,12,
      14,10,7,3,7,null,10,null, 11,11,14,null,17,14,11,7,
      13,13,8,null,5,8,13,null, 12,8,5,8,12,15,12,null,
      15,12,8,12,19,15,12,8, 14,11,7,null,3,2,0,null,
    ],
    bridge:[
      1,null,null,null,5,null,8,null, 5,null,null,8,12,null,null,null,
      0,null,null,null,7,null,null,null, 3,null,7,null,10,null,7,null,
      3,null,null,7,10,null,null,null, 8,null,null,12,15,null,12,null,
      5,null,8,null,12,null,8,null, 7,null,11,null,14,null,7,null,
    ],
    counterline:[5,8,12,8,8,12,15,12,3,7,10,7,7,11,14,11,1,5,8,5,5,8,12,8,8,12,15,12,7,11,14,7],
  },
  {
    id:3, sectors:[7,8,9], title:'Glassstorm', bpm:126, root:47,
    lead:'mallet', counter:'pluck', color:2250, swing:0,
    rhythm:{bass:[0,3,6,8,11,14],kick:[0,6,11],snare:[6,14],hat:[0,3,6,8,11,14],rim:[4,10,15]},
    chords:[[0,3,7,10],[5,9,12,16],[2,5,9,12],[7,10,14,17],[8,12,15,19],[3,7,10,14]],
    harmony:[0,2,1,3,0,4,2,3, 4,1,5,2,4,5,1,3, 2,4,0,5,1,2,4,3, 0,2,1,3,4,1,2,0],
    theme:[
      0,7,3,null,10,7,null,3, 2,9,5,null,12,9,5,null,
      5,12,9,null,16,12,null,9, 7,14,10,null,17,14,10,7,
      12,7,3,null,10,3,null,7, 8,15,12,null,19,15,12,null,
      14,9,5,null,12,9,null,2, 17,14,10,7,14,null,10,null,
    ],
    answer:[
      19,12,15,null,8,12,null,15, 16,9,12,null,5,9,12,null,
      14,7,10,null,3,7,null,10, 12,5,9,null,2,5,9,null,
      15,19,12,8,15,null,12,8, 10,14,7,3,10,null,7,3,
      12,16,9,5,12,null,9,5, 14,17,10,7,14,10,7,null,
    ],
    bridge:[
      2,null,9,null,null,5,12,null, 8,null,15,null,null,12,19,null,
      0,null,7,null,null,3,10,null, 3,null,10,null,null,7,14,null,
      5,null,12,null,null,9,16,null, 2,null,9,null,null,5,12,null,
      8,null,15,null,null,12,19,null, 7,null,14,null,null,10,17,null,
    ],
    counterline:[8,15,12,19,5,12,9,16,3,10,7,14,2,9,5,12,8,12,15,19,3,7,10,14,5,9,12,16,7,10,14,17],
  },
  {
    id:4, sectors:[10], title:'A Light Beyond', bpm:84, root:45,
    lead:'horn', counter:'bell', color:1850, swing:0,
    rhythm:{bass:[0,6,8],kick:[0,8],snare:[12],hat:[2,10],rim:[7,15]},
    chords:[[0,3,7,10],[5,9,12,16],[8,12,15,19],[7,11,14,17],[3,7,10,14],[0,4,7,11]],
    harmony:[0,1,2,3,0,4,1,3, 2,4,1,3,2,1,3,3, 4,2,1,5,4,1,2,3, 5,1,2,3,4,1,3,5],
    theme:[
      0,null,null,3,7,null,10,null, 5,null,null,9,12,null,16,null,
      8,null,12,null,15,null,12,null, 7,null,11,null,14,11,7,null,
      12,null,10,7,3,null,7,null, 10,null,7,3,7,null,10,null,
      12,null,9,5,9,null,12,null, 14,null,11,7,11,14,17,null,
    ],
    answer:[
      15,null,19,15,12,null,8,null, 14,null,10,7,10,null,14,null,
      16,null,12,9,12,16,19,null, 17,null,14,11,14,null,17,null,
      19,15,12,null,8,12,15,null, 16,12,9,null,5,9,12,null,
      14,null,17,19,17,14,11,null, 7,null,11,14,17,14,11,null,
    ],
    bridge:[
      3,null,null,null,7,null,10,null, 8,null,null,null,12,null,15,null,
      5,null,null,9,12,null,null,null, 4,null,null,7,11,null,null,null,
      3,null,7,null,10,null,14,null, 5,null,9,null,12,null,16,null,
      8,null,12,null,15,null,19,null, 7,null,11,null,14,null,17,null,
    ],
    counterline:[8,12,15,19,3,7,10,14,5,9,12,16,7,11,14,17,8,12,15,19,5,9,12,16,7,11,14,17,0,4,7,12],
  },
];

export const MUSIC_STEPS = 32 * 16;
export const MUSIC_SECTIONS = ['theme', 'answer', 'bridge', 'reprise'];

export function getMusicTrack(stageId) {
  const sector = Number.isFinite(stageId) ? Math.max(1, Math.min(10, Math.floor(stageId))) : 1;
  return MUSIC_TRACKS[Math.floor((sector - 1) / 3)];
}

export function musicStepEvents(stageId, step) {
  const track = getMusicTrack(stageId), beat = 60 / track.bpm, sixteenth = beat / 4;
  const wholeStep = Number.isFinite(step) ? Math.floor(step) : 0;
  const index = ((wholeStep % MUSIC_STEPS) + MUSIC_STEPS) % MUSIC_STEPS;
  const bar = Math.floor(index / 16), slot = index % 16;
  const sectionIndex = Math.floor(bar / 8), section = MUSIC_SECTIONS[sectionIndex];
  const chord = track.chords[track.harmony[bar]], groove = track.rhythm;
  const bridge = section === 'bridge', reprise = section === 'reprise';
  const intro = bar < 2, full = !bridge && !intro, events = [];
  const phrase = bridge ? track.bridge : sectionIndex === 1 ? track.answer : track.theme;
  const add = (voice, note, duration, volume, options = {}) => events.push({voice, ...(note === undefined ? {} : {note}), duration, volume, ...options});

  if (slot === 0) {
    for (let i = 0; i < chord.length; i++) {
      const note = track.root + 12 + chord[i] - (i === 3 ? 12 : 0);
      add('pad', note, beat * (bridge ? 3.95 : 3.65), bridge ? .024 : .019,
        {instrument:'pad', pan:(i - 1.5) * .22, delay:i * .022});
    }
  }
  if (groove.bass.includes(slot) && (!bridge || slot === 0 || slot >= 8)) {
    // Iron River alternates root and fifth; Glassstorm walks through its offbeat accents.
    const passing = track.id === 2 ? chord[slot % 8 === 0 ? 0 : 2]
      : track.id === 3 ? chord[groove.bass.indexOf(slot) % chord.length]
      : slot >= 12 ? chord[2] : slot > 0 && bar % 2 ? chord[1] : chord[0];
    add('bass', track.root - 12 + passing, beat * (bridge ? 1.1 : track.id === 2 ? .38 : .6), bridge ? .11 : .15, {instrument:'bass'});
  }
  if (slot % 2 === 0) {
    const phraseIndex = (bar % 8) * 8 + slot / 2;
    let note = phrase[phraseIndex];
    if (note !== null) {
      // The final track blooms into major for its last bar and settles on the tonic.
      if (track.id === 4 && bar === 31) note = [12,null,11,7,4,7,12,null][slot / 2];
      if (note !== null) {
        const lift = reprise && bar >= 28 && track.id === 1 ? 12 : 0;
        const delayed = slot % 4 === 2 ? sixteenth * track.swing : 0;
        const duration = beat * (['mallet','pluck'].includes(track.lead) ? .7 : phrase[(phraseIndex + 1) % 64] === null ? 1.45 : .68);
        add('lead', track.root + 24 + note + lift, duration, bridge ? .094 : track.id === 4 ? .12 : .13,
          {instrument:bridge ? (track.id === 2 ? 'mallet' : 'flute') : track.lead, pan:-.12, delay:delayed});
        // Glassstorm's delayed mallet answers give it a rippling, unsettled edge.
        if (track.id === 3 && [0,6,10].includes(slot) && full)
          add('echo', track.root + 24 + note, beat * .55, .027, {instrument:'mallet', pan:.42, delay:beat * .75});
        if (track.id === 4 && reprise && slot % 4 === 0)
          add('echo', track.root + 12 + note, beat * 1.15, .03, {instrument:'horn', pan:.3, delay:.028});
      }
    }
  }
  if ((sectionIndex === 1 || reprise) && slot % 4 === (track.id === 3 ? 1 : 3)) {
    const note = track.counterline[(bar % 8) * 4 + Math.floor(slot / 4)];
    add('counter', track.root + 12 + note, beat * .78, .058,
      {instrument:track.counter, pan:.32, delay:sixteenth * track.swing});
  }
  // Each returning theme gains a different ornament, rather than a shared loudness boost.
  if (reprise && bar >= 28 && (track.id === 1 ? [5,13].includes(slot) : track.id === 2 ? [2,10].includes(slot) : track.id === 3 ? [3,7,11,15].includes(slot) : slot === 0))
    add('arp', track.root + 24 + chord[(Math.floor(slot / 4) + bar) % chord.length], beat * (track.id === 4 ? 1.8 : .38), .033,
      {instrument:track.id === 4 ? 'bell' : track.counter,pan:.4});

  if (groove.kick.includes(slot) && (!bridge || slot === 0 && bar % 2 === 0))
    add('kick', undefined, .19, intro ? .14 : .20);
  if (groove.snare.includes(slot) && !intro && (!bridge || bar % 2 === 1 && slot >= 8))
    add('snare', undefined, track.id === 4 ? .17 : .11, track.id === 1 ? .05 : .068);
  if (groove.hat.includes(slot) && !bridge && (!intro || slot >= 8))
    add('hat', undefined, .038, slot % 4 === 0 ? .017 : .011, {pan:.24,delay:slot % 4 === 2 ? sixteenth * track.swing : 0});
  if (groove.rim.includes(slot) && full && bar % 2 === 1)
    add('rim', undefined, .065, .037, {pan:-.24});
  // Sparse low toms for the opening; syncopated fills late; broad rolls in the finale.
  const fillSlots = track.id === 1 ? [12,14] : track.id === 2 ? [10,12,15] : track.id === 3 ? [9,12,14,15] : [8,10,12,14];
  if (bar % 4 === 3 && fillSlots.includes(slot) && !bridge)
    add('tom', 46 - fillSlots.indexOf(slot) * 3, .18, track.id === 4 ? .068 : .06, {pan:(fillSlots.indexOf(slot) - 1.5) * .18});
  return {track, section, bar, stepSeconds:sixteenth, events};
}
