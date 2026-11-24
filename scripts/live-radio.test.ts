import assert from 'node:assert/strict';
import test from 'node:test';
import {
  directoryStations,
  ITALIAN_PRESETS,
  liveStationOf,
  matchesStation,
  refreshStations,
  searchStations,
  stationMediaItem,
} from '@/services/liveRadio';
import { trackFromMediaItem } from '@/services/mediaItems';
import { radioBrandOf } from '@/services/radioBranding';
import { describeRadioButton } from '@/services/playbackStatus';
import { readJSON } from '@/services/storage';
import { toggleRadioFavorite } from '@/store/radioFavorites';

const [m2o, ibiza] = ITALIAN_PRESETS;
const row = {
  stationuuid: m2o.id,
  name: 'm2o',
  countrycode: 'IT',
  lastcheckok: 1,
  hls: 1,
  url_resolved: 'https://streams.example/on-air',
};

test('gli UUID distinguono le reti principali e l’emittente italiana Radio Ibiza', () => {
  assert.equal(new Set(ITALIAN_PRESETS.map((s) => s.id)).size, 10);
  for (const station of ITALIAN_PRESETS) {
    const item = stationMediaItem(station);
    assert.deepEqual(liveStationOf(item), station);
    assert.equal(trackFromMediaItem(item), null);
  }
  assert.ok(matchesStation(ibiza, ' IBIZA '));
  assert.ok(matchesStation(m2o, 'dance'));
  assert.equal(ibiza.homepage, 'https://radioibiza.it/');
});

test('le grafiche ufficiali seguono l’UUID o il flusso esatto, anche dalle preferite', () => {
  for (const station of ITALIAN_PRESETS) {
    const brand = radioBrandOf(station);
    assert.ok(brand);
    assert.equal(new URL(brand.banner).protocol, 'https:');
    if (brand.thumbnail) assert.equal(new URL(brand.thumbnail).protocol, 'https:');
    assert.equal(radioBrandOf({ ...station, stream: 'https://new.example/live' }), brand);
    assert.equal(radioBrandOf({ ...station, id: 'alias' }), brand);
  }
  assert.equal(radioBrandOf(null), undefined);
  assert.equal(
    radioBrandOf({ ...ibiza, id: 'other', stream: 'https://other.example/live' }),
    undefined,
  );
});

test('il cuore su un alias rimuove la stessa diretta e distingue emittenti omonime', () => {
  const alias = { ...m2o, id: '11111111-2222-3333-4444-555555555555' };
  const other = { ...alias, id: '11111111-2222-3333-4444-666666666666', stream: ibiza.stream };
  toggleRadioFavorite(m2o);
  toggleRadioFavorite(other);
  assert.deepEqual(readJSON('radio.favorites.v1'), [other, m2o]);
  toggleRadioFavorite(alias);
  assert.deepEqual(readJSON('radio.favorites.v1'), [other]);
  toggleRadioFavorite({ ...other, stream: 'https://updated.example/radio' });
  assert.deepEqual(readJSON('radio.favorites.v1'), []);
});

test('una diretta interrotta offre lo stesso comando di riconnessione a fine flusso e in errore', () => {
  const retry = { icon: 'refresh', label: 'Riprova la diretta', busy: false };
  assert.deepEqual(describeRadioButton('ended'), retry);
  assert.deepEqual(describeRadioButton('error'), retry);
  assert.equal(describeRadioButton('buffering').busy, true);
  assert.equal(describeRadioButton('playing').icon, 'pause');
  assert.equal(describeRadioButton('paused').icon, 'play');
});

test('usa lo stream aggiornato, riconosce HLS senza estensione e scarta le voci guaste o estere', () => {
  const result = directoryStations([
    row,
    row,
    { ...row, lastcheckok: 0 },
    { ...row, countrycode: 'ES' },
    { ...row, stationuuid: ibiza.id, url_resolved: 'http://old.example/ibiza', hls: 0 },
    { ...row, stationuuid: '11111111-2222-3333-4444-555555555555', url_resolved: 'file:///etc/a' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].stream, row.url_resolved);
  assert.equal(stationMediaItem(result[0]).mimeType, 'application/x-mpegURL');
  assert.equal(result[1].stream, ibiza.stream);
  assert.throws(() => directoryStations({ error: 'temporaneo' }));
});

test('se il primo server cade, aggiorna gli UUID sul secondo senza registrare ascolti', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    paths.push(url);
    if (paths.length === 1) throw new Error('timeout');
    return Response.json([row]);
  });
  assert.equal((await refreshStations([m2o.id]))[0].stream, row.url_resolved);
  assert.equal(paths.length, 2);
  assert.notEqual(new URL(paths[0]).host, new URL(paths[1]).host);
  assert.ok(paths.every((p) => p.includes('/stations/byuuid?uuids=' + m2o.id)));
});

test('la ricerca interroga nome e genere in Italia e mantiene i risultati parziali', async (t) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.searchParams.has('name')) throw new Error('non raggiungibile');
    return Response.json([row, row]);
  });
  assert.deepEqual(
    (await searchStations('dance & pop')).map((s) => s.id),
    [m2o.id],
  );
  assert.ok(
    requests.every(
      (u) =>
        u.searchParams.get('countrycode') === 'IT' && u.searchParams.get('hidebroken') === 'true',
    ),
  );
  assert.ok(requests.some((u) => u.searchParams.get('tag') === 'dance & pop'));
  const abort = new AbortController();
  abort.abort();
  const count = requests.length;
  await assert.rejects(searchStations('m2o', abort.signal), { name: 'AbortError' });
  assert.equal(requests.length, count);
});
