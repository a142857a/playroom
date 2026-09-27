(function (root, factory) {
  'use strict';
  const opera = typeof module === 'object' && module.exports ? require('./opera-tracks.js') : root.FeltOpera;
  const api = factory(opera.TRACKS);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FeltTracks = api;
})(typeof window !== 'undefined' ? window : null, function (operaTracks) {
  'use strict';

  // Newly programmed reductions of public-domain compositions. Track metadata
  // distinguishes excerpts from complete musical forms; none are recordings.
  // Source references and the exact reductions are documented in MUSIC_SOURCES.md.
  const pitch = name => {
    const match = /^([A-G])([#b]?)([0-8])$/.exec(name);
    if (!match) throw new Error('Invalid pitch: ' + name);
    return (Number(match[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]]
      + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
  };
  function score(metadata, beats, compose) {
    const notes = [];
    const beatMs = 60000 / metadata.bpm;
    function note(name, start, length, velocity = 0.76, gate = 0.93) {
      const startMs = Math.round(start * beatMs);
      notes.push({ midi: typeof name === 'number' ? name : pitch(name), start: startMs,
        duration: Math.max(1, Math.round((start + length * gate) * beatMs) - startMs), velocity });
    }
    function line(events, start = 0, velocity = 0.76, gate = 0.93) {
      let cursor = start;
      events.forEach(([name, length]) => {
        if (name) note(name, cursor, length, velocity, gate);
        cursor += length;
      });
      return cursor;
    }
    const chord = (names, start, length, velocity = 0.4) => names.forEach(name => note(name, start, length, velocity));
    compose({ note, line, chord });
    notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    const duration = Math.round(beats * beatMs) + 500;
    return Object.freeze({ ...metadata, duration, notes: Object.freeze(notes.map(Object.freeze)) });
  }
  const q = names => names.split(' ').map(name => [name, 1]);
  const eighths = names => names.split(' ').map(name => [name, 0.5]);
  const sixteenths = names => names.split(' ').map(name => [name, 0.25]);

  const furElise = score({
    id: 'fur-elise', title: 'Für Elise', composer: 'Ludwig van Beethoven', era: 'Classical',
    bpm: 72, key: 'A minor', suggestedInstrument: 'grand',
    description: 'Opening excerpt · the familiar eight-bar phrase, repeated',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931'
  }, 24, ({ line }) => {
    const theme = [
      ...sixteenths('E5 D#5 E5 D#5 E5 B4 D5 C5'),
      ['A4', 0.5], [null, 0.25], ...sixteenths('C4 E4 A4'),
      ['B4', 0.5], [null, 0.25], ...sixteenths('E4 G#4 B4'),
      ['C5', 0.5], [null, 0.25], ...sixteenths('E4 E5 D#5'),
      ...sixteenths('E5 D#5 E5 B4 D5 C5'),
      ['A4', 0.5], [null, 0.25], ...sixteenths('C4 E4 A4'),
      ['B4', 0.5], [null, 0.25], ...sixteenths('E4 C5 B4'), ['A4', 1]
    ];
    [0, 12].forEach(start => {
      line(theme, start);
      [[2, 'A2 E3 A3'], [3.5, 'E2 E3 G#3'], [5, 'A2 E3 A3'],
        [8, 'A2 E3 A3'], [9.5, 'E2 E3 G#3'], [11, 'A2 E3 A3']]
        .forEach(([offset, notes]) => line(sixteenths(notes), start + offset, 0.44));
    });
  });

  const odeToJoy = score({
    id: 'ode-to-joy', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', era: 'Classical',
    bpm: 92, key: 'D major', suggestedInstrument: 'musicbox',
    description: 'Theme excerpt · eight bars from Symphony No. 9',
    sourceUrl: 'https://musopen.org/music/2571-symphony-no-9-in-d-minor-op-125/'
  }, 32, ({ line, chord }) => {
    const first = [...q('F#4 F#4 G4 A4 A4 G4 F#4 E4 D4 D4 E4 F#4')];
    line([...first, ['F#4', 1.5], ['E4', 0.5], ['E4', 2],
      ...first, ['E4', 1.5], ['D4', 0.5], ['D4', 2]]);
    [['D3', 'F#3', 'A3'], ['A2', 'E3', 'A3'], ['D3', 'F#3', 'A3'], ['A2', 'E3', 'G3'],
      ['D3', 'F#3', 'A3'], ['A2', 'E3', 'A3'], ['D3', 'F#3', 'A3'], ['D3', 'F#3', 'A3']]
      .forEach((notes, bar) => chord(notes, bar * 4, 3.7, 0.37));
  });

  const moonlight = score({
    id: 'moonlight', title: 'Moonlight Sonata', composer: 'Ludwig van Beethoven', era: 'Classical',
    bpm: 60, key: 'C♯ minor', suggestedInstrument: 'felt',
    description: 'Opening excerpt · eight bars of the first movement',
    sourceUrl: 'https://imslp.org/wiki/Moonlight_sonata'
  }, 32, ({ note, line, chord }) => {
    const groups = [
      'G#3 C#4 E4', 'G#3 C#4 E4', 'G#3 C#4 E4', 'G#3 C#4 E4',
      'G#3 C#4 E4', 'G#3 C#4 E4', 'G#3 C#4 E4', 'G#3 C#4 E4',
      'A3 C#4 E4', 'A3 C#4 E4', 'A3 D4 F#4', 'A3 D4 F#4',
      'G#3 C4 F#4', 'G#3 C#4 E4', 'G#3 C#4 D#4', 'F#3 C4 D#4',
      'E3 G#3 C#4', 'G#3 C#4 E4', 'G#3 C#4 E4', 'G#3 C#4 E4',
      'G#3 D#4 F#4', 'G#3 D#4 F#4', 'G#3 D#4 F#4', 'G#3 D#4 F#4',
      'G#3 C#4 E4', 'G#3 C#4 E4', 'A3 C#4 F#4', 'A3 C#4 F#4',
      'G#3 B3 E4', 'G#3 B3 E4', 'A3 B3 D#4', 'A3 B3 D#4'
    ];
    groups.forEach((group, beat) => line(group.split(' ').map(name => [name, 1 / 3]), beat, 0.44, 0.98));
    [[0, 4, ['C#2', 'C#3']], [4, 4, ['B1', 'B2']], [8, 2, ['A1', 'A2']],
      [10, 2, ['F#1', 'F#2']], [12, 2, ['G#1', 'G#2']], [14, 2, ['G#1', 'G#2']],
      [16, 4, ['C#2', 'G#2', 'C#3']], [20, 4, ['C2', 'G#2', 'C3']],
      [24, 2, ['C#2', 'C#3']], [26, 2, ['F#1', 'F#2']],
      [28, 2, ['B1', 'B2']], [30, 2, ['B1', 'B2']]]
      .forEach(([start, length, names]) => chord(names, start, length, 0.33));
    [[19, 0.75, 'G#4'], [19.75, 0.25, 'G#4'], [20, 3, 'G#4'], [23, 0.75, 'G#4'],
      [23.75, 0.25, 'G#4'], [24, 2, 'G#4'], [26, 2, 'A4'], [28, 2, 'G#4'],
      [30, 1, 'F#4'], [31, 1, 'B4']].forEach(([start, length, name]) => note(name, start, length));
  });

  const prelude = score({
    id: 'prelude-c', title: 'Prelude in C major', composer: 'Johann Sebastian Bach', era: 'Baroque',
    bpm: 72, key: 'C major', suggestedInstrument: 'grand',
    description: 'Opening excerpt · eight flowing bars from BWV 846',
    sourceUrl: 'https://imslp.org/wiki/Prelude_and_Fugue_in_C_major,_BWV_846_(Bach,_Johann_Sebastian)'
  }, 32, ({ note }) => {
    ['C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5',
      'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5']
      .forEach((harmony, bar) => {
        const names = harmony.split(' ');
        [0, 2].forEach(half => {
          const start = bar * 4 + half;
          note(names[0], start, 1.95, 0.46);
          note(names[1], start + 0.25, 1.7, 0.5);
          [2, 3, 4, 2, 3, 4].forEach((index, i) => note(names[index], start + 0.5 + i * 0.25, 0.25, i % 3 === 2 ? 0.65 : 0.6));
        });
      });
  });

  const canon = score({
    id: 'canon-d', title: 'Canon in D', composer: 'Johann Pachelbel', era: 'Baroque',
    bpm: 76, key: 'D major', suggestedInstrument: 'strings',
    description: 'Theme excerpt · melody over the repeating eight-note bass',
    sourceUrl: 'https://imslp.org/wiki/Canon_and_Gigue_in_D_major,_P.37_(Pachelbel,_Johann)'
  }, 32, ({ note, line, chord }) => {
    line('F#5 E5 D5 C#5 B4 A4 B4 C#5 D5 C#5 B4 A4 G4 F#4 G4 E4'.split(' ').map(name => [name, 2]));
    const bass = 'D3 A2 B2 F#2 G2 D2 G2 A2'.split(' ');
    const harmonies = ['F#3 A3 D4', 'E3 A3 C#4', 'F#3 B3 D4', 'F#3 A3 C#4',
      'G3 B3 D4', 'F#3 A3 D4', 'G3 B3 D4', 'E3 A3 C#4'];
    for (let i = 0; i < 16; i++) {
      note(bass[i % 8], i * 2, 1.9, 0.43);
      chord(harmonies[i % 8].split(' '), i * 2 + 0.5, 1.4, 0.3);
    }
  });

  const eineKleine = score({
    id: 'eine-kleine', title: 'Eine kleine Nachtmusik', composer: 'Wolfgang Amadeus Mozart', era: 'Classical',
    bpm: 126, key: 'G major', suggestedInstrument: 'grand',
    description: 'Opening excerpt · twelve bars, with ornaments simplified',
    sourceUrl: 'https://imslp.org/wiki/Serenade_No.13,_K.525_(Mozart,_Wolfgang_Amadeus)'
  }, 48, ({ line, chord }) => {
    line([
      ['G5', 1], [null, 0.5], ['D5', 0.5], ['G5', 1], [null, 0.5], ['D5', 0.5],
      ...eighths('G5 D5 G5 B5'), ['D6', 1], [null, 1],
      ['C6', 1], [null, 0.5], ['A5', 0.5], ['C6', 1], [null, 0.5], ['A5', 0.5],
      ...eighths('C6 A5 F#5 A5'), ['D5', 1], [null, 1],
      ['G5', 0.5], [null, 0.5], ['G5', 1.5], ...eighths('B5 A5 G5'),
      ['G5', 0.5], ['F#5', 0.5], ['F#5', 1.5], ...eighths('A5 C6 F#5'),
      ['A5', 0.5], ['G5', 0.5], ['G5', 1.5], ...eighths('B5 A5 G5'),
      ['G5', 0.5], ['F#5', 0.5], ['F#5', 1.5], ...eighths('A5 C6 F#5'),
      ...eighths('G5 G5 F#5 F#5 G5 G5 A5 A5'),
      ...eighths('B5 B5 C6 C6'), ['D6', 1], [null, 1],
      ['D5', 2], ['E5', 2], ...q('C5 C5 B4 B4')
    ], 0, 0.78, 0.82);
    const harmonies = ['G3 B3 D4', 'G3 B3 D4', 'D3 F#3 A3', 'D3 F#3 A3',
      'G3 B3 D4', 'D3 F#3 A3', 'G3 B3 D4', 'D3 F#3 A3',
      'G3 B3 D4', 'G3 B3 D4', 'G3 B3 D4', 'D3 F#3 A3'];
    harmonies.forEach((names, bar) => {
      chord(names.split(' '), bar * 4, 1.6, 0.38);
      chord(names.split(' '), bar * 4 + 2, 1.6, 0.33);
    });
  });

  const swanLake = score({
    id: 'swan-lake', title: 'Swan Lake', composer: 'Pyotr Ilyich Tchaikovsky', era: 'Romantic',
    bpm: 80, key: 'B minor', suggestedInstrument: 'strings',
    description: 'Theme excerpt · the oboe melody from Act II, No. 10',
    sourceUrl: 'https://imslp.org/wiki/Swan_Lake,_Op.20_(Tchaikovsky,_Pyotr_Ilyich)'
  }, 32, ({ line, note, chord }) => {
    const phrase = [
      ['F#5', 2], ...eighths('B4 C#5 D5 E5'),
      ['F#5', 1.5], ['D5', 0.5], ['F#5', 1.5], ['D5', 0.5],
      ['F#5', 1.5], ...eighths('B4 D5 B4 G4 D5')
    ];
    line([...phrase, ['B4', 2.5], ...eighths('E5 D5 C#5'),
      ...phrase, ['B4', 3], ['B4', 1]], 0, 0.76, 0.98);
    ['B2', 'B2', 'G2', 'F#2', 'B2', 'B2', 'G2', 'B2'].forEach((bass, bar) => note(bass, bar * 4, 3.8, 0.37));
    ['B3 D4 F#4', 'B3 D4 F#4', 'G3 B3 D4', 'F#3 A#3 C#4',
      'B3 D4 F#4', 'B3 D4 F#4', 'G3 B3 D4', 'B3 D4 F#4']
      .forEach((names, bar) => chord(names.split(' '), bar * 4 + 0.5, 3.3, 0.3));
  });

  const gymnopedie = score({
    id: 'gymnopedie', title: 'Gymnopédie No. 1', composer: 'Erik Satie', era: 'Late Romantic',
    bpm: 72, key: 'D major', suggestedInstrument: 'felt',
    description: 'Opening excerpt · twelve bars of the quiet waltz',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37'
  }, 36, ({ note, line, chord }) => {
    for (let bar = 0; bar < 12; bar++) {
      note(bar % 2 ? 'D2' : 'G2', bar * 3, 2.95, 0.4);
      // Once the melody reaches its long F#4, omit the unison accompaniment
      // pitch so that a single sustained voice carries the original tie.
      const voicing = bar % 2 ? ['A3', 'C#4'] : ['B3', 'D4'];
      if (bar < 8) voicing.push('F#4');
      chord(voicing, bar * 3 + 1, 1.95, 0.33);
    }
    line([...q('F#5 A5 G5 F#5 C#5 B4 C#5 D5'), ['A4', 3], ['F#4', 12]], 13, 0.73, 0.99);
  });

  const turkishMarch = score({
    id: 'turkish-march', title: 'Turkish March', composer: 'Wolfgang Amadeus Mozart', era: 'Classical',
    bpm: 96, key: 'A minor', suggestedInstrument: 'grand',
    description: 'Opening excerpt · the first strain of Rondo alla turca, repeated',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=108'
  }, 32, ({ line, note, chord }) => {
    const strain = [
      ...sixteenths('B4 A4 G#4 A4'), ['C5', 0.5], [null, 0.5],
      ...sixteenths('D5 C5 B4 C5'), ['E5', 0.5], [null, 0.5],
      ...sixteenths('F5 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5'),
      ['C6', 1], ...eighths('A5 C6 B5 A5 G5 A5 B5 A5 G5 A5 B5 A5 G5 F#5'), ['E5', 1]
    ];
    [0, 16].forEach(start => {
      line(strain, start, 0.78, 0.82);
      for (let bar = 0; bar < 7; bar++) {
        const offset = start + 1 + bar * 2;
        const tonic = bar < 4;
        note(tonic ? 'A3' : 'E3', offset, 0.5, 0.42);
        [0.5, 1, 1.5].forEach(beat => chord(tonic ? ['C4', 'E4'] : ['B3', 'E4'], offset + beat, 0.4, 0.32));
      }
      chord(['E3', 'B3', 'E4'], start + 15, 0.9, 0.38);
    });
  });

  const minuet = score({
    id: 'minuet-g', title: 'Minuet in G', composer: 'Christian Petzold', era: 'Baroque',
    bpm: 112, key: 'G major', suggestedInstrument: 'grand',
    description: 'Opening excerpt · sixteen bars from the Anna Magdalena notebook',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=75'
  }, 48, ({ line, chord }) => {
    const opening = [
      ['D5', 1], ...eighths('G4 A4 B4 C5'), ...q('D5 G4 G4'),
      ['E5', 1], ...eighths('C5 D5 E5 F#5'), ...q('G5 G4 G4'),
      ['C5', 1], ...eighths('D5 C5 B4 A4'), ['B4', 1], ...eighths('C5 B4 A4 G4')
    ];
    line([...opening, ['F#4', 1], ...eighths('G4 A4 B4 G4'), ['A4', 3],
      ...opening, ['A4', 1], ...eighths('B4 A4 G4 F#4'), ['G4', 3]], 0, 0.76, 0.92);
    chord(['G3', 'B3', 'D4'], 0, 2, 0.4);
    line([['A3', 1], ['B3', 3], ['C4', 3], ['B3', 3], ['A3', 3], ['G3', 3],
      ...q('D4 B3 G3 D4'), ...eighths('D3 C4 B3 A3'), ['B3', 2], ['A3', 1],
      ...q('G3 B3 G3'), ['C4', 3], ['B3', 1], ...eighths('C4 B3 A3 G3'),
      ['A3', 2], ['F#3', 1], ['G3', 2], ['B3', 1], ...q('C4 D4 D3'), ['G3', 2], ['G2', 1]], 2, 0.42);
  });

  const spring = score({
    id: 'spring', title: 'Spring', composer: 'Antonio Vivaldi', era: 'Baroque',
    bpm: 112, key: 'E major', suggestedInstrument: 'strings',
    description: 'Opening excerpt · the bright refrain from The Four Seasons',
    sourceUrl: 'https://imslp.org/wiki/Violin_Concerto_in_E_major,_RV_269_(Vivaldi,_Antonio)'
  }, 38, ({ line, chord }) => {
    const firstBar = [...eighths('G#5 G#5 G#5'), ...sixteenths('F#5 E5'), ['B5', 1.5], ...sixteenths('B5 A5')];
    const answer = [['G#5', 0.5], ...sixteenths('A5 B5'), ...eighths('A5 G#5')];
    const rising = [['B5', 0.5], ...sixteenths('A5 G#5'), ...eighths('A5 B5 C#6'), ['B5', 1], ['E5', 0.5]];
    line([['E5', 0.5], ...firstBar, ...firstBar, ...answer, ...eighths('F#5 D#5 B4 E5'),
      ...firstBar, ...firstBar, ...answer, ['F#5', 1], [null, 0.5], ['E5', 0.5],
      ...rising, ...rising, ['C#6', 0.5], ['B5', 1], ...eighths('A5 G#5'),
      ...sixteenths('F#5 E5'), ['F#5', 1], ['E5', 1]], 0, 0.76, 0.84);
    const harmonies = ['E3 G#3 B3', 'E3 G#3 B3', 'B2 D#3 F#3', 'E3 G#3 B3', 'E3 G#3 B3',
      'B2 D#3 F#3', 'E3 G#3 B3', 'E3 G#3 B3', 'B2 D#3 F#3'];
    harmonies.forEach((names, bar) => [0, 1, 2, 3].forEach(beat => chord(names.split(' '), 0.5 + bar * 4 + beat, 0.8, 0.31)));
    chord(['E3', 'G#3', 'B3'], 36.5, 1.5, 0.39);
  });

  const lullaby = score({
    id: 'brahms-lullaby', title: 'Brahms’ Lullaby', composer: 'Johannes Brahms', era: 'Romantic',
    bpm: 72, key: 'E♭ major', suggestedInstrument: 'musicbox',
    description: 'Theme excerpt · the first eight vocal bars, with a held ending',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1037'
  }, 25, ({ line, note, chord }) => {
    line([...eighths('G4 G4'), ['Bb4', 1.5], ['G4', 0.5], ['G4', 1],
      ['Bb4', 1], [null, 1], ...eighths('G4 Bb4'), ['Eb5', 1], ['D5', 1.5], ['C5', 0.5],
      ...q('C5 Bb4'), ...eighths('F4 G4'), ...q('Ab4 F4'), ...eighths('F4 G4'),
      ['Ab4', 1], [null, 1], ...eighths('F4 Ab4 D5 C5'), ...q('Bb4 D5'), ['Eb5', 3]], 0, 0.74, 0.98);
    ['Eb3', 'Eb3', 'Eb3', 'Bb2', 'Bb2', 'Bb2', 'Bb2', 'Eb3'].forEach((bass, bar) => {
      note(bass, 1 + bar * 3, 2.9, 0.36);
      const harmony = bar < 3 || bar === 7 ? ['G3', 'Bb3', 'Eb4'] : ['Ab3', 'Bb3', 'D4'];
      chord(harmony, 2 + bar * 3, 1.8, 0.27);
    });
  });

  const aveMaria = score({
    id: 'ave-maria', title: 'Ave Maria', composer: 'Franz Schubert', era: 'Romantic',
    bpm: 54, key: 'B♭ major', suggestedInstrument: 'strings',
    description: 'Vocal-theme excerpt · opening phrases with a shortened return',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1054'
  }, 22, ({ line, chord }) => {
    const invocation = [['Bb4', 1.5], ...sixteenths('A4 Bb4'), ['D5', 1.75], ['C5', 0.25]];
    line([...invocation, ['Bb4', 1], [null, 1], ['C5', 1], ...sixteenths('Bb4 A4 G4 A4'),
      ['Bb4', 1], [null, 0.5], ['D5', 0.5], ['D5', 0.75], ['C5', 0.125], ['Bb4', 0.125], ...sixteenths('A4 G4 D5 E5'),
      ['D5', 1], ['C#5', 0.75], ['A4', 0.25], ['C5', 0.75], ['Bb4', 0.25],
      ...'A4 C5 D5 Eb5 C5 A4'.split(' ').map(name => [name, 1 / 6]),
      ...invocation, ['Bb4', 2]], 0, 0.75, 0.98);
    ['Bb2 D3 F3', 'G2 Bb2 D3', 'Bb2 D3 F3', 'A2 C#3 E3', 'Bb2 D3 F3']
      .forEach((names, bar) => chord(names.split(' '), bar * 4, 3.85, 0.32));
    chord(['Bb2', 'D3', 'F3'], 20, 1.9, 0.32);
  });

  const chopinPrelude = score({
    id: 'chopin-prelude-7', title: 'Prelude Op. 28 No. 7', composer: 'Frédéric Chopin', era: 'Romantic',
    bpm: 64, key: 'A major', suggestedInstrument: 'felt',
    description: 'Opening excerpt · eight bars of the miniature in A major',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=470'
  }, 24, ({ line, note, chord }) => {
    line([['E4', 1], ['C#5', 0.75], ['D5', 0.25], ...q('B4 B4'), ['B4', 2],
      ['F#5', 1], ['D#5', 0.75], ['E5', 0.25], ...q('A5 A5'), ['A5', 2],
      ['C#5', 1], ['A#4', 0.75], ['B4', 0.25], ...q('D5 D5'), ['D5', 2],
      ['G#5', 1], ['G#5', 0.75], ['A5', 0.25], ...q('C#6 C#6'), ['C#6', 2]], 0, 0.73, 0.97);
    [['E2', ['E3', 'G#3', 'D4']], ['A2', ['A3', 'C#4', 'E4']],
      ['E2', ['E3', 'B3', 'F#4']], ['A1', ['E3', 'A3', 'E4']]].forEach(([bass, harmony], phrase) => {
      const start = 1 + phrase * 6;
      note(bass, start, 0.95, 0.4);
      chord(harmony, start + 1, 0.95, 0.3);
      chord(harmony, start + 2, 0.95, 0.3);
      chord(harmony, start + 3, 1.95, 0.3);
    });
  });

  const oldFrenchSong = score({
    id: 'old-french-song', title: 'Old French Song', composer: 'Pyotr Ilyich Tchaikovsky', era: 'Romantic',
    bpm: 70, key: 'G minor', suggestedInstrument: 'grand', category: 'classical', coverage: 'Complete piece',
    description: 'Complete piece · all 32 bars, with the contrasting middle and final return',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2080'
  }, 64.5, ({ line, note, chord }) => {
    // Schirmer's complete A–A–B–A form, with the repeated A already unfolded.
    // The pickup for each A belongs to the preceding bar (except the opening).
    const head = [['D4', 0.5], ...eighths('G4 A4 Bb4 C5'), ['D5', 1.5], ['D5', 0.5],
      ...eighths('C5 D5 Eb5 C5'), ['D5', 1.5], ['D5', 0.5], ...eighths('C5 D5 Eb5 C5'),
      ['D5', 0.5], ...sixteenths('Eb5 D5'), ...eighths('C5 Bb4'), ['A4', 1.75], ['G4', 0.25]];
    line([...head, ['G4', 1.5]], 0, 0.76, 0.97);
    line([...head, ['G4', 2]], 16, 0.73, 0.97);
    line([['G4', 1], ...eighths('G4 A4'), ['Bb4', 1.5], ['Bb4', 0.5],
      ...q('C5 C5'), ['A4', 1.5], ['A4', 0.5], ['D5', 1.5], ['D5', 0.5],
      ['Eb5', 0.5], ...sixteenths('F5 Eb5'), ...eighths('D5 C5'),
      ['Bb4', 1], ...eighths('A4 G4'), ['A4', 1.5]], 32.5, 0.8, 0.97);
    note('F#4', 46.5, 1.5, 0.43, 0.97); // Lower note in the middle section's closing dyad.
    line([...head, ['G4', 2]], 48, 0.76, 0.97);

    // The G3 inner-voice attacks coincide with the bass and share one event.
    const innerA = [...eighths('Bb3 C4 D4 C4'), ['Bb3', 2],
      ...q('Eb4 C4 Bb3'), [null, 1], ...q('Eb4 C4 Bb3'), [null, 1]];
    [0.5, 16.5, 48.5].forEach(start => {
      line(innerA, start, 0.34, 0.97);
      // The pedal bass ties across each pair of bars; repeated attacks are
      // retained only where the score restrikes G.
      line([['G3', 3], ['G3', 4], ['G3', 4], ['G3', 1]], start, 0.4, 0.99);
    });
    [0.5, 16.5].forEach(start => {
      note('C4', start + 12, 2, 0.34, 0.97);
      line(q('F#3 D3'), start + 12, 0.4, 0.97);
    });
    note('Bb3', 14.5, 1, 0.34, 0.97);
    line(q('G3 G2'), 14.5, 0.4, 0.95);
    chord(['G3', 'Bb3'], 30.5, 2, 0.36);

    // The contrasting B section changes to lightly detached broken chords.
    ['C3 G3 C4 Eb4', 'G2 G3 C4 Eb4', 'C3 G3 C4 Eb4', 'D3 A3 C4 F#4']
      .forEach((names, bar) => line(eighths(names), 32.5 + bar * 2, 0.38, 0.65));
    chord(['G3', 'Bb3'], 40.5, 0.5, 0.38);
    line(eighths('D4 G4'), 41, 0.38, 0.9);
    chord(['C4', 'Eb4', 'G4'], 42.5, 2, 0.4);
    chord(['D4', 'G4'], 44.5, 1, 0.38);
    line(q('D4 D3'), 46.5, 0.36, 0.97);

    // The final A has a different two-bar cadence, including its inner voice.
    line(q('Eb4 D4'), 60.5, 0.36, 0.97);
    line(q('G3 F#3'), 60.5, 0.34, 0.97);
    line(q('C3 D3'), 60.5, 0.4, 0.97);
    chord(['G2', 'D3', 'Bb3'], 62.5, 2, 0.38);
  });

  const traumerei = score({
    id: 'traumerei', title: 'Träumerei', composer: 'Robert Schumann', era: 'Romantic',
    bpm: 62, key: 'F major', suggestedInstrument: 'felt',
    description: 'Opening excerpt · the first eight bars from Kinderszenen',
    sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=504'
  }, 32, ({ line, chord }) => {
    const ascent = [['F4', 2.5], ...eighths('E4 F4 A4')];
    line([['C4', 1], ...ascent, ...eighths('C5 F5'), ['F5', 2], ...eighths('E5 D5 C5 F5 G4 A4 Bb4 D5 F4 G4 A4 C5'),
      ['G4', 2], ['C4', 1], ...ascent, ...eighths('C5 A5'), ['A5', 1.5], ...eighths('G5 F5 E5 F5 A5 D5 F5'),
      ['E5', 1.5], ['Eb5', 0.5], ...q('D5 E5 C5')], 0, 0.73, 0.99);
    ['F2 A2 C3', 'Bb2 D3 F3', 'C3 E3 G3', 'F2 A2 C3',
      'F2 A2 C3', 'A2 C#3 E3', 'D3 F3 A3', 'G2 B2 D3'].forEach((names, bar) => {
      const length = bar === 7 ? 3 : 4;
      chord(names.split(' '), 1 + bar * 4, length * 0.98, 0.32);
    });
  });

  const TRACKS = Object.freeze([furElise, odeToJoy, moonlight, prelude, canon, eineKleine, swanLake, gymnopedie,
    turkishMarch, minuet, spring, lullaby, aveMaria, chopinPrelude, oldFrenchSong, traumerei, ...operaTracks]);
  return Object.freeze({ TRACKS });
});
