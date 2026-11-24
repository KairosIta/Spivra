/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { searchAll } from '@/services/sources';
import { NO_ACCESS, setSourceAccess } from '@/services/sources/access';
import { jamendoSource } from '@/services/sources/jamendo';
import {
  durationFromMinutes,
  durationLabel,
  matchesDuration,
  orderVersionUploads,
  parseTrackSearch,
  rankSearchTracks,
  THREE_MINUTES,
} from '@/services/trackSearch';
import type { Track } from '@/types/track';
import {
  getSearchSelection,
  recallSearch,
  setSearchDuration,
  setSearchInput,
} from '@/store/searchSelection';

const track = (title: string, artist: string, durationSec: number): Track => ({
  title,
  artist,
  durationSec,
  source: 'audius',
  uid: 'audius:' + title + artist,
  id: title,
  streamUrl: 'https://example.invalid/stream',
});

test('ricerca: il titolo e artista esatti proteggono anche una canzone di 53 secondi', () => {
  const original = track('Làmpo', 'Doppio Cavo', 53);
  const teaser = track('Lampo (teaser)', 'Doppio Cavo', 18);
  const other = track('Lampo', 'Arco Corto', 230);
  const live = track('Lampo (Live)', 'Doppio Cavo', 51);
  const candidates = [teaser, other, live, original];
  for (const query of ['Lampo di Doppio Cavo', 'Doppio Cavo — Lampo', 'LAMPO / DOPPIO CAVO']) {
    assert.equal(rankSearchTracks(candidates, query)[0], original, query);
  }
  assert.equal(rankSearchTracks(candidates, 'Lampo Doppio Cavo live')[0], live);
  assert.equal(rankSearchTracks(candidates, 'Lampo di Doppio Cavo teaser')[0], teaser);
  const longer = track('Làmpo', 'Doppio Cavo', 243);
  assert.equal(rankSearchTracks([original, longer], 'Lampo di Doppio Cavo')[0], longer);
  assert.equal(candidates[0], teaser, 'la pagina originale resta riutilizzabile');
});

test('ricerca: un estratto scende, la durata sconosciuta è neutra e le parità conservano l’ordine', () => {
  const clip = track('Deep house preview', 'Duo', 25);
  const complete = track('Luce', 'Duo', 184);
  const unknown = track('Vento', 'Duo', 0);
  const short = track('Idea', 'Duo', 37);
  const brief = track('Breve giro', 'Duo', 98);
  assert.deepEqual(rankSearchTracks([clip, short, brief, unknown, complete], 'deep house'), [
    unknown,
    complete,
    brief,
    short,
    clip,
  ]);
  assert.equal(rankSearchTracks([complete, short], 'Idea')[0], short);
  assert.equal(rankSearchTracks([clip, complete], 'deep house anteprima')[0], clip);
  assert.equal(rankSearchTracks([complete, track('東京', '光', 50)], '東京')[0].title, '東京');
});

for (const version of ['Live', 'Remix']) {
  test(`ricerca: due caricamenti dello stesso ${version}, con e senza richiesta di anteprima`, () => {
    const short = track(`Òrbite (${version})`, 'Dùo', 24);
    const full = track(`Orbite – ${version}`, 'Duo', 272);
    const homonym = track(full.title, 'Altro artista', 180);
    const query = `Orbite ${version}`;
    const uploads = [short, homonym, full];
    assert.deepEqual(rankSearchTracks(uploads, query), [full, homonym, short]);
    assert.equal(rankSearchTracks([short, full], `Orbite Duo ${version}`)[0], full);
    assert.equal(rankSearchTracks([short, full], `${query} di Duo`)[0], full);
    assert.deepEqual(uploads, [short, homonym, full]);

    const preview = track(`${full.title} (Preview)`, 'Duo', 35);
    for (const word of [
      'anteprima',
      'anteprime',
      'estratto',
      'preview',
      'teaser',
      'snippet',
      'clip',
      'loop',
    ]) {
      assert.deepEqual(rankSearchTracks([full, homonym, short, preview], `${query} ${word}`), [
        preview,
        short,
        homonym,
        full,
      ]);
    }
  });
}

test('Cerca confronta anche copie arrivate su pagine diverse, lasciando al loro posto le altre versioni e le durate ignote', async (t) => {
  setSourceAccess({ ...NO_ACCESS, isActive: (id) => id === 'audius' });
  t.after(() => setSourceAccess(NO_ACCESS));
  const title = 'Orbite (Remix)';
  const upload = (id: string, duration: number, name = title) => ({
    id,
    title: name,
    duration,
    user: { name: 'Duo' },
  });
  const pages = [
    [upload('estratto', 24), upload('club', 38, 'Orbite (Club Remix)'), upload('ignoto', 0)],
    [upload('completo', 272), upload('altro-completo', 420)],
  ];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const offset = Number(new URL(input).searchParams.get('offset'));
    return Response.json({ data: pages[offset / 3] });
  });
  const first = await searchAll('remix', { limit: 3 });
  const second = await searchAll('remix', { limit: 3, cursor: first.next });
  const loaded = [...first.tracks, ...second.tracks];
  const ordered = orderVersionUploads(loaded, 'remix');
  assert.deepEqual(
    ordered.map((item) => item.id),
    ['completo', 'club', 'ignoto', 'altro-completo', 'estratto'],
  );
  assert.equal(loaded[0].id, 'estratto');
});

test('durata: interpreta i qualificatori in coda e conserva i titoli e gli intervalli malformati', () => {
  assert.deepEqual(parseTrackSearch('  Deep house, DA 4 A 7 MIN.  '), {
    query: 'Deep house',
    duration: { minSec: 240, maxSec: 420 },
  });
  assert.deepEqual(parseTrackSearch('jazz almeno 1 minuto'), {
    query: 'jazz',
    duration: { minSec: 60 },
  });
  for (const query of [
    '4 minuti',
    'Almeno 3 minuti',
    'Da 4 a 7 minuti',
    'jazz da 7 a 4 minuti',
    'jazz da 4 a 7',
    'jazz da 4 a 7 minuti live',
  ]) {
    assert.deepEqual(parseTrackSearch(query), { query });
  }
  assert.deepEqual(parseTrackSearch('rock, ' + durationLabel(THREE_MINUTES)), {
    query: 'rock',
    duration: THREE_MINUTES,
  });
  assert.deepEqual(parseTrackSearch('rock, ' + durationLabel({ minSec: 0, maxSec: 60 })), {
    query: 'rock',
    duration: { minSec: 0, maxSec: 60 },
  });
  for (const seconds of [0, -1, NaN, Infinity, 239, 421]) {
    assert.equal(matchesDuration(seconds, { minSec: 240, maxSec: 420 }), false);
  }
  for (const seconds of [240, 300, 420])
    assert.ok(matchesDuration(seconds, { minSec: 240, maxSec: 420 }));
});

test('pannello durata: accetta un solo limite, gli estremi uguali e le ricerche recenti di entrambe le versioni', () => {
  assert.equal(durationLabel({ minSec: 600 }, 'short'), 'Almeno 10 min');
  assert.equal(durationLabel({ minSec: 240, maxSec: 420 }, 'short'), 'Da 4 a 7 min');
  for (const [minimum, maximum, expected] of [
    [' 3 ', '', { minSec: 180 }],
    ['', '2', { minSec: 0, maxSec: 120 }],
    ['4', '7', { minSec: 240, maxSec: 420 }],
    ['1', '1', { minSec: 60, maxSec: 60 }],
  ] as const) {
    assert.deepEqual(durationFromMinutes(minimum, maximum), expected);
    assert.deepEqual(parseTrackSearch('jazz, ' + durationLabel(expected)), {
      query: 'jazz',
      duration: expected,
    });
  }
  assert.deepEqual(
    parseTrackSearch('rock da 0 a 2 minuti'),
    parseTrackSearch('rock fino a 2 minuti'),
  );
  for (const [min, max] of [
    ['', ''],
    ['4', '3'],
    ['-1', '7'],
    ['3.5', '6'],
    ['', '0'],
    ['3', '1e9'],
    ['9'.repeat(18), ''],
  ]) {
    assert.equal(durationFromMinutes(min, max), undefined, `${min}–${max}`);
  }
});

test('Cerca e radio condividono il filtro cambiando testo, intervallo, esempio e ricerca recente', (t) => {
  t.after(() => recallSearch(''));
  recallSearch('');
  setSearchDuration({ minSec: 600 });
  setSearchInput('ambient');
  assert.deepEqual(getSearchSelection().duration, { minSec: 600 });
  setSearchInput('ambient da 4 a 7 minuti');
  assert.deepEqual(getSearchSelection().duration, { minSec: 240, maxSec: 420 });
  setSearchDuration({ minSec: 0, maxSec: 300 });
  assert.equal(getSearchSelection().input, 'ambient');
  assert.deepEqual(getSearchSelection().duration, { minSec: 0, maxSec: 300 });
  recallSearch('jazz live');
  assert.equal(getSearchSelection().duration, undefined);
  recallSearch('ambient, da 4 a 7 minuti');
  setSearchDuration(undefined);
  assert.deepEqual(getSearchSelection().draft, { query: 'ambient' });
  assert.equal(getSearchSelection().duration, undefined);
});

test('ricerca federata: Jamendo include i singoli, la durata vale per entrambe le sorgenti e il cursore avanza sulle pagine lette', async (t) => {
  setSourceAccess({ ...NO_ACCESS, isActive: () => true });
  t.after(() => setSourceAccess(NO_ACCESS));
  const audiusOffsets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'api.jamendo.com') {
      assert.equal(url.searchParams.get('search'), 'deep house');
      assert.equal(url.searchParams.get('type'), 'single albumtrack');
      assert.equal(url.searchParams.get('durationbetween'), '240_420');
      return Response.json({
        headers: { status: 'success' },
        results: [
          {
            id: 'j1',
            name: 'Deep house',
            audio: 'https://example.invalid/a',
            duration: '240',
            album_id: '',
          },
          { id: 'j2', name: 'Estratto', audio: 'https://example.invalid/b', duration: 18 },
        ],
      });
    }
    assert.equal(url.hostname, 'api.audius.co');
    assert.equal(url.searchParams.get('query'), 'deep house');
    assert.equal(url.searchParams.has('durationbetween'), false);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    audiusOffsets.push(offset);
    const duration = offset === 0 ? 19 : 420;
    return Response.json({
      data: [{ title: 'Lato B', id: 'a' + offset, duration, user: { name: 'Duo' } }],
    });
  });
  const page = await searchAll('deep house da 4 a 7 minuti', { limit: 2 });
  assert.deepEqual(page.failed, []);
  assert.deepEqual(
    page.tracks.map((item) => item.uid),
    ['jamendo:j1', 'audius:a2'],
  );
  assert.equal(page.tracks[0].albumId, undefined);
  assert.deepEqual(audiusOffsets, [0, 2]);
  assert.deepEqual(page.next, { audius: 4, jamendo: 2 });
});

test('durata rara: la ricerca si ferma dopo tre pagine e il caricamento successivo riprende senza buchi', async (t) => {
  setSourceAccess({ ...NO_ACCESS, isActive: (id) => id === 'audius' });
  t.after(() => setSourceAccess(NO_ACCESS));
  const offsets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const offset = Number(new URL(input).searchParams.get('offset') ?? 0);
    offsets.push(offset);
    const data =
      offset > 6 ? [] : [{ id: 'a' + offset, title: 'Idea', duration: offset === 6 ? 180 : 15 }];
    return Response.json({ data });
  });
  const filter = { query: 'rock', duration: THREE_MINUTES };
  const first = await searchAll(filter, { limit: 2 });
  assert.deepEqual(first, { tracks: [], failed: [], next: { audius: 6 } });
  assert.deepEqual(offsets, [0, 2, 4]);
  const second = await searchAll(filter, { limit: 2, cursor: first.next });
  assert.deepEqual(
    second.tracks.map((item) => item.uid),
    ['audius:a6'],
  );
  assert.deepEqual((await searchAll(filter, { limit: 2, cursor: second.next })).next, undefined);
  assert.deepEqual(offsets, [0, 2, 4, 6, 8]);
});

test('Jamendo: singoli anche a durata libera e intervallo chiuso per il filtro rapido', async (t) => {
  const requests: URLSearchParams[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    requests.push(new URL(input).searchParams);
    return Response.json({
      headers: { status: 'success' },
      results: [{ id: '3', name: 'Tre', audio: 'https://example.invalid/t' }],
    });
  });
  await jamendoSource.search({ query: 'Lampo' });
  await jamendoSource.search({ query: 'Lampo', duration: THREE_MINUTES });
  await jamendoSource.trending();
  assert.deepEqual(
    requests.map((p) => p.get('type')),
    ['single albumtrack', 'single albumtrack', null],
  );
  assert.deepEqual(
    requests.map((p) => p.get('durationbetween')),
    [null, '180_2147483647', null],
  );
});
