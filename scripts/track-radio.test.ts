/// <reference types="node" />

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { player } from '@/player';
import { toMediaItem } from '@/services/mediaItems';
import { enqueueRadioTracks, radioQueueIds } from '@/services/radioQueue';
import { trackRadio } from '@/services/sources';
import { NO_ACCESS, setSourceAccess } from '@/services/sources/access';
import {
  getSearchSelection,
  recallSearch,
  setSearchDuration,
  setSearchInput,
} from '@/store/searchSelection';
import type { SourceId, Track } from '@/types/track';
import { fakePlayer } from './doubles/player';

const range = { minSec: 240, maxSec: 420 };
const seed = (source: SourceId): Track => ({
  source,
  id: 'originale',
  uid: source + ':originale',
  title: 'Punto di partenza',
  artist: 'Artista',
  artistId: 'artista',
  durationSec: 300,
  streamUrl: 'https://example.invalid/s',
});
const jamendo = (id: string, duration: number | string) => ({
  id,
  name: id,
  artist_name: 'Artista',
  duration,
  audio: 'https://example.invalid/stream',
});
const audius = (id: string, duration: number, mood?: string, bpm?: number) => ({
  id,
  title: id,
  duration,
  genre: 'House',
  mood,
  bpm,
  user: { id: 'artista', name: 'Duo' },
});
beforeEach(() => setSourceAccess({ ...NO_ACCESS, isActive: () => true }));
afterEach(() => setSourceAccess(NO_ACCESS));

test('Accoda della radio conserva ordine, brano e posizione e salta chi è già in coda anche al secondo tocco', () => {
  const current = seed('jamendo');
  const first = seed('audius');
  const second = { ...first, id: 'secondo', uid: 'audius:secondo' };
  player.setMediaItems([toMediaItem(current)], 0);
  player.seekTo(35);
  fakePlayer.clearCalls();

  enqueueRadioTracks([second]);
  enqueueRadioTracks([first, second, first]);
  enqueueRadioTracks([first, second]);
  assert.deepEqual(fakePlayer.calls(), ['insertMediaItems', 'insertMediaItems']);
  assert.deepEqual(
    player.getQueue().map((item) => item.mediaId),
    [current.uid, second.uid, first.uid],
  );
  assert.equal(player.getActiveMediaItem()?.mediaId, current.uid);
  assert.equal(player.getProgress().position, 35);

  player.removeMediaItem(1);
  assert.equal(radioQueueIds().has(second.uid), false);
  setSourceAccess(NO_ACCESS);
  assert.equal(enqueueRadioTracks([second]).has(second.uid), false);
});

test('un inserimento rifiutato dal player lascia i suggerimenti disponibili al nuovo tentativo', (t) => {
  player.setMediaItems([], 0);
  const candidate = seed('audius');
  const insert = t.mock.method(player, 'insertMediaItems', () => {});
  assert.equal(enqueueRadioTracks([candidate]).has(candidate.uid), false);
  insert.mock.restore();
  assert.equal(enqueueRadioTracks([candidate]).has(candidate.uid), true);
});

test('la radio ritrova intervallo digitato, filtro rapido e ricerca recente anche fuori da Cerca', () => {
  recallSearch('jazz');
  setSearchDuration({ minSec: 180 });
  assert.deepEqual(getSearchSelection().duration, { minSec: 180 });
  setSearchInput('jazz da 4 a 7 minuti');
  assert.deepEqual(getSearchSelection().duration, range);
  setSearchDuration(undefined);
  assert.equal(getSearchSelection().input, 'jazz');
  assert.equal(getSearchSelection().duration, undefined);
  recallSearch('house, almeno 8 minuti');
  assert.deepEqual(getSearchSelection().duration, { minSec: 480 });
  recallSearch('');
});

test('Jamendo: cinque diversi, entro i limiti inclusivi, anche sulla pagina successiva', async (t) => {
  const offsets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/v3.0/tracks/similar/');
    assert.equal(url.searchParams.get('id'), 'originale');
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    const results =
      offset === 0
        ? [
            jamendo('originale', 300),
            jamendo('estratto', 239),
            jamendo('minimo', '240'),
            jamendo('ignoto', ''),
            jamendo('massimo', 420),
            jamendo('lungo', 421),
            { ...jamendo('muto', 300), audio: '' },
          ]
        : [
            jamendo('minimo', 240),
            ...['tre', 'quattro', 'cinque', 'sei'].map((id) => jamendo(id, 300)),
          ];
    return Response.json({ headers: { status: 'success' }, results });
  });
  const found = await trackRadio(seed('jamendo'), { duration: range });
  assert.deepEqual(
    found.map((track) => track.id),
    ['minimo', 'massimo', 'tre', 'quattro', 'cinque'],
  );
  assert.deepEqual(offsets, [0, 25]);
});

test('Jamendo: anche il ripiego sullo stesso artista conserva la durata e si ferma con pochi brani', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    paths.push(url.pathname);
    let results;
    if (url.pathname === '/v3.0/tracks/similar/')
      results = [jamendo('uno', 260), jamendo('no', 18)];
    else if (url.searchParams.has('include')) results = [jamendo('originale', 300)];
    else {
      assert.equal(url.searchParams.get('artist_id'), 'artista');
      assert.equal(url.searchParams.get('durationbetween'), '240_420');
      results = [jamendo('uno', 260), jamendo('due', 274), jamendo('troppo', 650)];
    }
    return Response.json({ headers: { status: 'success' }, results });
  });
  const found = await trackRadio(seed('jamendo'), { duration: range });
  assert.deepEqual(
    found.map((track) => track.id),
    ['uno', 'due'],
  );
  assert.equal(paths.length, 7, 'anche pagine sempre uguali hanno un limite');
});

test('Jamendo: i tag del brano completano cinque proposte quando i simili sono troppo brevi', async (t) => {
  let details = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    const query = url.searchParams;
    let results;
    if (url.pathname.endsWith('/similar/')) results = [jamendo('estratto', 45)];
    else if (query.get('include') === 'musicinfo') {
      details++;
      assert.equal(query.get('id'), 'originale');
      assert.equal(query.get('type'), 'single albumtrack');
      results = [
        {
          ...jamendo('originale', 300),
          musicinfo: { tags: { genres: ['house', 'dance'], vartags: ['house', 'night'] } },
        },
      ];
    } else {
      assert.equal(query.get('fuzzytags'), 'house dance night');
      assert.equal(query.get('durationbetween'), '240_420');
      results = query.has('offset')
        ? ['tre', 'quattro', 'cinque'].map((id) => jamendo(id, 400))
        : [jamendo('uno', 300), jamendo('due', 240), jamendo('troppo lungo', 560)];
    }
    return Response.json({ headers: { status: 'success' }, results });
  });
  const found = await trackRadio(seed('jamendo'), { duration: range });
  assert.deepEqual(
    found.map((track) => track.id),
    ['uno', 'due', 'tre', 'quattro', 'cinque'],
  );
  assert.equal(details, 1);
});

test('Audius: usa i metadati del brano salvato e ordina per atmosfera e BPM nel genere', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    paths.push(url.pathname);
    if (url.pathname === '/v1/tracks/originale')
      return Response.json({ data: audius('originale', 300, 'Cool', 120) });
    assert.equal(url.pathname, '/v1/tracks/search');
    assert.equal(url.searchParams.get('genre'), 'House');
    return Response.json({
      data: [
        audius('altro', 320, 'Happy', 120),
        audius('ignoto', 0, 'Cool', 120),
        audius('lento', 250, 'Cool', 85),
        { ...audius('a pagamento', 300, 'Cool', 120), is_stream_gated: true },
        { ...audius('bloccato', 300, 'Cool', 120), is_streamable: false },
        audius('vicino', 300, 'Cool', 121),
        audius('breve', 28, 'Cool', 120),
        audius('uguale', 267, 'Cool', 120),
        audius('senza tempo', 181, 'Cool'),
        audius('originale', 300, 'Cool', 120),
      ],
    });
  });
  const found = await trackRadio(seed('audius'), { duration: { minSec: 180 } });
  assert.deepEqual(
    found.map((track) => track.id),
    ['uguale', 'vicino', 'lento', 'senza tempo', 'altro'],
  );
  assert.deepEqual(paths, ['/v1/tracks/originale', '/v1/tracks/search']);
});

test('Audius: senza genere usa atmosfera, poi artista, anche senza una durata scelta', async (t) => {
  const artistOffsets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/v1/tracks/originale') return Response.json({ data: { mood: 'Cool' } });
    if (url.pathname === '/v1/tracks/search') {
      assert.equal(url.searchParams.get('mood'), 'Cool');
      return Response.json({ data: [] });
    }
    assert.equal(url.pathname, '/v1/users/artista/tracks');
    const offset = Number(url.searchParams.get('offset'));
    artistOffsets.push(offset);
    return Response.json({ data: offset ? [] : [audius('breve', 52)] });
  });
  assert.deepEqual(
    (await trackRadio(seed('audius'))).map((track) => track.id),
    ['breve'],
  );
  assert.deepEqual(artistOffsets, [0, 25]);
});

test('radio: un intervallo senza corrispondenze resta vuoto, gli errori di rete arrivano alla schermata', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async (input: string) => {
    const detail = new URL(input).pathname === '/v1/tracks/originale';
    return Response.json({ data: detail ? {} : [audius('troppo breve', 10)] });
  });
  assert.deepEqual(await trackRadio(seed('audius'), { duration: range }), []);
  request.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(trackRadio(seed('audius')), /503/u);
});

test('radio: nessuna richiesta per una sorgente spenta o una ricerca già annullata', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('richiesta inattesa');
  });
  for (const source of ['audius', 'jamendo'] as const) {
    await assert.rejects(trackRadio(seed(source), { signal: AbortSignal.abort() }), {
      name: 'AbortError',
    });
  }
  setSourceAccess(NO_ACCESS);
  assert.deepEqual(await trackRadio(seed('audius')), []);
  assert.deepEqual(await trackRadio(seed('jamendo')), []);
  assert.equal(request.mock.callCount(), 0);
});

test('radio: se una pagina cade, conserva i brani compatibili e completa con gli altri elenchi', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/originale'))
      return Response.json({ data: audius('originale', 300) });
    if (url.pathname.endsWith('/search') && url.searchParams.has('offset'))
      return new Response(null, { status: 503 });
    if (url.pathname.endsWith('/search')) return Response.json({ data: [audius('uno', 300)] });
    if (url.searchParams.has('offset')) return Response.json({ data: [] });
    return Response.json({ data: [audius('due', 240), audius('breve', 29)] });
  });
  assert.deepEqual(
    (await trackRadio(seed('audius'), { duration: range })).map((t) => t.id),
    ['uno', 'due'],
  );
});
