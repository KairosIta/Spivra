import type { MediaItem } from '@/player';
import { isRecord } from '@/utils/validate';
import { cancelledError, fetchJSON } from './sources/http';

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  stream: string;
  hls: boolean;
  homepage?: string;
}

// Gli UUID identificano la diretta principale anche quando cambia il suo URL.
// Questi flussi HTTPS permettono il primo ascolto anche con il catalogo fuori rete.
export const ITALIAN_PRESETS: RadioStation[] = [
  {
    id: '484e2020-8858-4509-aa1a-cc156f0c4d2f',
    name: 'm2o',
    genre: 'Dance · Elettronica',
    stream: 'https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiom2o/radiom2o/master_ma.m3u8',
    hls: true,
    homepage: 'https://www.m2o.it/',
  },
  {
    id: '962c02bc-0601-11e8-ae97-52543be04c81',
    name: 'Radio Ibiza',
    genre: 'Dance · Napoli',
    stream: 'https://kisskiss.fluidstream.eu/ibiza.mp3',
    hls: false,
    homepage: 'https://radioibiza.it/',
  },
  {
    id: 'f4a651c0-6ba6-4845-838f-095aff86a67e',
    name: 'Radio Italia',
    genre: 'Solo musica italiana',
    stream: 'https://radioitaliasmi.akamaized.net/hls/live/2093120/RISMI/master.m3u8',
    hls: true,
    homepage: 'https://www.radioitalia.it/',
  },
  {
    id: '6623c04a-8c8d-4ef7-aa6a-d14361fbb0be',
    name: 'Virgin Radio',
    genre: 'Rock',
    stream: 'https://icy.unitedradio.it/Virgin.mp3',
    hls: false,
    homepage: 'https://www.virginradio.it/',
  },
  {
    id: 'b16ad874-7085-47b9-841c-a2fc551c1d65',
    name: 'RTL 102.5',
    genre: 'Hit · Attualità',
    stream:
      'https://dd782ed59e2a4e86aabf6fc508674b59.msvdn.net/live/S97044836/tbbP8T1ZRPBL/playlist_audio.m3u8',
    hls: true,
    homepage: 'https://www.rtl.it/',
  },
  {
    id: '3bbd0c70-fb75-416d-8e80-babeff39904c',
    name: 'RDS',
    genre: '100% Grandi Successi',
    stream: 'https://stream.rds.radio/audio/rds.stream_aac/playlist.m3u8',
    hls: true,
    homepage: 'https://www.rds.it/',
  },
  {
    id: 'e7a4fe38-d564-452c-b6a5-bf446cab1026',
    name: 'Radio Deejay',
    genre: 'Pop · Intrattenimento',
    stream:
      'https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiodeejay/radiodeejay/master_ma.m3u8',
    hls: true,
    homepage: 'https://www.deejay.it/',
  },
  {
    id: '77601de4-40ed-11ea-a9fa-52543be04c81',
    name: 'Radio 105',
    genre: 'Hit · Intrattenimento',
    stream: 'https://icecast.unitedradio.it/Radio105.mp3',
    hls: false,
    homepage: 'https://www.105.net/',
  },
  {
    id: '22c8a12c-6d82-4b8d-874f-74074e9ec011',
    name: 'Rai Radio 1',
    genre: 'Notizie · Sport',
    stream:
      'https://icecdn-19d24861e90342cc8decb03c24c8a419.msvdn.net/icecastRelay/S18493106/rCMKqdMFKPBB/icecast',
    hls: false,
    homepage: 'https://www.raiplaysound.it/radio1',
  },
  {
    id: '044acc55-255b-4382-af22-ccf28445bb3e',
    name: 'Radio Capital',
    genre: 'Classici · Attualità',
    stream:
      'https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiocapital/radiocapital/master_ma.m3u8',
    hls: true,
    homepage: 'https://www.capital.it/',
  },
];

const presets = new Map(ITALIAN_PRESETS.map((station) => [station.id, station]));
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const prefix = 'radio-browser:';
export const isLiveRadioId = (id?: string) => id?.startsWith(prefix) === true;

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password)
      return url.href;
  } catch {
    // Nel catalogo comunitario alcuni campi contengono testo libero.
  }
  return undefined;
}

export function parseStation(value: unknown): RadioStation | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuid.test(value.id)) return null;
  const stream = httpsUrl(value.stream);
  if (!stream || typeof value.name !== 'string' || !value.name.trim()) return null;
  return {
    id: value.id,
    name: value.name.trim(),
    genre: typeof value.genre === 'string' ? value.genre : '',
    stream,
    hls: value.hls === true || /\.m3u8(?:[?#]|$)/i.test(stream),
    homepage: httpsUrl(value.homepage),
  };
}

export function liveStationOf(item: MediaItem | null): RadioStation | null {
  if (!item || !isLiveRadioId(item.mediaId)) return null;
  const station = parseStation(item.extras?.station);
  return station && item.mediaId === prefix + station.id ? station : null;
}

export function stationMediaItem(station: RadioStation): MediaItem {
  return {
    mediaId: prefix + station.id,
    title: station.name,
    artist: 'In diretta',
    url: station.stream,
    mimeType: station.hls ? 'application/x-mpegURL' : undefined,
    extras: { station },
  };
}

export function sameRadioStation(a: RadioStation, b: RadioStation): boolean {
  return a.id === b.id || a.stream === b.stream;
}

export function distinctStations(stations: RadioStation[]): RadioStation[] {
  const ids = new Set<string>();
  const streams = new Set<string>();
  return stations.filter(({ id, stream }) => {
    if (ids.has(id) || streams.has(stream)) return false;
    ids.add(id);
    streams.add(stream);
    return true;
  });
}

export function matchesStation(station: RadioStation, query: string): boolean {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  return fold(station.name + ' ' + station.genre).includes(fold(query.trim()));
}

export function directoryStations(raw: unknown): RadioStation[] {
  if (!Array.isArray(raw)) throw new Error('Risposta del catalogo radio illeggibile');
  const stations: RadioStation[] = [];
  for (const row of raw) {
    if (!isRecord(row) || row.countrycode !== 'IT' || row.lastcheckok !== 1) continue;
    const preset = typeof row.stationuuid === 'string' ? presets.get(row.stationuuid) : undefined;
    const stream = httpsUrl(row.url_resolved) ?? httpsUrl(row.url);
    const station = parseStation({
      id: row.stationuuid,
      name: preset?.name ?? row.name,
      stream: stream ?? preset?.stream,
      hls: stream ? row.hls === 1 : preset?.hls,
      genre:
        preset?.genre ??
        (typeof row.tags === 'string'
          ? row.tags.split(',').filter(Boolean).slice(0, 3).join(' · ')
          : ''),
      homepage: preset?.homepage ?? row.homepage,
    });
    if (station) stations.push(station);
  }
  return distinctStations(stations);
}

// Il nome DNS collettivo segue la rotazione dei server di Radio Browser.
const mirrors = ['all.api.radio-browser.info', 'de1.api.radio-browser.info'];
const headers = { 'User-Agent': 'Spivra/0.2 (Android)' };
async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  let failure: unknown;
  for (const host of mirrors) {
    try {
      return await fetchJSON('Radio Browser', 'https://' + host + '/json/' + path, {
        signal,
        timeoutMs: 5000,
        headers,
      });
    } catch (error) {
      if (signal?.aborted) throw cancelledError('Radio Browser');
      failure = error;
    }
  }
  throw failure;
}

export async function refreshStations(
  ids: string[],
  signal?: AbortSignal,
): Promise<RadioStation[]> {
  return directoryStations(await request('stations/byuuid?uuids=' + ids.join(','), signal));
}

export async function searchStations(query: string, signal?: AbortSignal): Promise<RadioStation[]> {
  const term = encodeURIComponent(query.trim());
  const base =
    'stations/search?countrycode=IT&hidebroken=true&order=clickcount&reverse=true&limit=36';
  const results = await Promise.allSettled(
    ['name', 'tag'].map(async (field) =>
      directoryStations(await request(base + '&' + field + '=' + term, signal)),
    ),
  );
  if (signal?.aborted) throw cancelledError('Radio Browser');
  const completed = results.filter((r) => r.status === 'fulfilled');
  if (!completed.length) throw new Error('Radio Browser non raggiungibile');
  return distinctStations(completed.flatMap((r) => r.value));
}

/** Una sola richiesta per scelta esplicita, anche se il server non risponde. */
export function countStationClick(id: string): void {
  void fetchJSON('Radio Browser', 'https://' + mirrors[0] + '/json/url/' + id, {
    timeoutMs: 5000,
    headers,
  }).catch(() => {});
}
