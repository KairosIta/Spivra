import type { Track, TrackDurationRange, TrackSearchParams } from '@/types/track';

export type TrackSearch = Pick<TrackSearchParams, 'query' | 'duration'>;

export const THREE_MINUTES: TrackDurationRange = { minSec: 180 };

// Solo un qualificatore in coda a un titolo o genere. «4 minuti» da solo
// resta un titolo da cercare, come «Almeno 3 minuti».
const DURATION_SUFFIX =
  /[\s,]+(?:da\s+(\d+)\s+a\s+(\d+)|almeno\s+(\d+)|fino\s+a\s+(\d+))\s*min(?:uti|uto)?\.?$/iu;

/** Gli stessi limiti, in minuti interi, per il pannello e per le frasi digitate. */
export function durationFromMinutes(
  minimum: string,
  maximum: string,
): TrackDurationRange | undefined {
  const from = minimum.trim();
  const to = maximum.trim();
  if ((!from && !to) || !/^\d*$/u.test(from) || !/^\d*$/u.test(to)) return undefined;
  const minSec = Number(from) * 60;
  const maxSec = to ? Number(to) * 60 : undefined;
  if (!Number.isSafeInteger(minSec)) return undefined;
  if (maxSec === undefined) return { minSec };
  if (!Number.isSafeInteger(maxSec) || maxSec < minSec || maxSec === 0) return undefined;
  return { minSec, maxSec };
}

export function parseTrackSearch(input: string): TrackSearch {
  const query = input.trim();
  const match = DURATION_SUFFIX.exec(query);
  if (!match) return { query };

  const subject = query.slice(0, match.index).trimEnd();
  const duration = durationFromMinutes(match[1] ?? match[3] ?? '', match[2] ?? match[4] ?? '');
  return subject && duration ? { query: subject, duration } : { query };
}

export function durationLabel(
  { minSec, maxSec }: TrackDurationRange,
  unitStyle: 'long' | 'short' = 'long',
): string {
  const minutes = (maxSec ?? minSec) / 60;
  const unit = unitStyle === 'short' ? 'min' : minutes === 1 ? 'minuto' : 'minuti';
  if (maxSec === undefined) return 'Almeno ' + minutes + ' ' + unit;
  if (minSec === 0) return 'Fino a ' + minutes + ' ' + unit;
  return 'Da ' + minSec / 60 + ' a ' + minutes + ' ' + unit;
}

export function matchesDuration(seconds: number, { minSec, maxSec }: TrackDurationRange): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds >= minSec &&
    (maxSec === undefined || seconds <= maxSec)
  );
}

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const EXCERPT = /\b(?:teasers?|previews?|snippets?|anteprim[ae]|estratt[oi]|clips?|loops?)\b/u;
const VERSIONS = new Set([
  'live',
  'remix',
  'cover',
  'acoustic',
  'acustico',
  'instrumental',
  'strumentale',
  'extended',
  'edit',
]);

function shortTrackPenalty(seconds: number): number {
  if (seconds > 0 && seconds < 60) return 1;
  if (seconds >= 60 && seconds < 120) return 0.25;
  return 0;
}

/** Scambia solo i posti dei caricamenti dello stesso live o remix con durata nota. */
export function orderVersionUploads(tracks: Track[], query: string): Track[] {
  if (tracks.length < 2) return tracks;
  const slotsByVersion = new Map<string, number[]>();
  tracks.forEach((track, index) => {
    if (!Number.isFinite(track.durationSec) || track.durationSec <= 0) return;
    const title = normalize(track.title);
    if (!/(?:^| )(?:live|remix)(?: |$)/u.test(title)) return;
    const artist = normalize(track.artist);
    if (!artist) return;
    const key = title + '|' + artist;
    const slots = slotsByVersion.get(key);
    if (slots) slots.push(index);
    else slotsByVersion.set(key, [index]);
  });

  const wantsExcerpt = EXCERPT.test(normalize(query));
  let ordered = tracks;
  for (const slots of slotsByVersion.values()) {
    if (slots.length < 2) continue;
    const uploads = slots.map((index) => tracks[index]);
    uploads.sort((a, b) => {
      const difference = shortTrackPenalty(a.durationSec) - shortTrackPenalty(b.durationSec);
      return wantsExcerpt ? -difference : difference;
    });
    if (ordered === tracks) ordered = tracks.slice();
    slots.forEach((slot, index) => {
      ordered[slot] = uploads[index];
    });
  }
  return ordered;
}

/** Punteggio solo per la pagina appena arrivata. A parità vale l'ordine federato. */
export function rankSearchTracks(tracks: Track[], query: string): Track[] {
  const text = normalize(query);
  if (!text || tracks.length < 2) return tracks;
  const words = [...new Set(text.split(' ').filter((word) => word !== 'di'))];
  const wantsExcerpt = EXCERPT.test(text);
  const versions = words.filter((word) => VERSIONS.has(word));

  function relevance(track: Track): number {
    const title = normalize(track.title);
    const artist = normalize(track.artist);
    const titleWords = new Set(title.split(' '));
    const requestedVersion = versions.some((version) => titleWords.has(version));
    // Anche due caricamenti con lo stesso titolo e artista possono durare
    // 20 secondi e 4 minuti. La durata li distingue all'interno della fascia
    // esatta, senza mandare una canzone breve dietro un'omonima di altri.
    const shortPenalty =
      wantsExcerpt || requestedVersion ? 0 : shortTrackPenalty(track.durationSec);
    if (
      text === `${title} di ${artist}` ||
      text === `${title} ${artist}` ||
      text === `${artist} ${title}`
    ) {
      return 12 - shortPenalty;
    }
    if (text === title) return 8 - shortPenalty;

    const terms = new Set([...titleWords, ...artist.split(' ')]);
    const matched = words.filter((word) => terms.has(word)).length;
    let score = (2 * matched) / Math.max(1, words.length) - shortPenalty;
    if (text === artist) score += 1;
    if (requestedVersion) score += 0.5;
    if (EXCERPT.test(title)) score += wantsExcerpt ? 1 : -3;
    return score;
  }

  const ranked = tracks
    .map((track) => ({ track, score: relevance(track) }))
    .sort((a, b) => b.score - a.score)
    .map(({ track }) => track);
  return orderVersionUploads(ranked, query);
}
