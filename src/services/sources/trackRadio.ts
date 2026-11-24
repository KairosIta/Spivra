import type { ListParams, SourceTrackPage, Track, TrackRadioParams } from '@/types/track';
import { matchesDuration } from '../trackSearch';
import { isSourceAvailable } from './access';
import { cancelledError } from './http';

export const TRACK_PLAYLIST_TITLE = 'Playlist da questo brano';

const SUGGESTIONS = 5;
const PAGE_SIZE = 25;
const PAGES_PER_LIST = 3;
export type RadioPage = (params: ListParams) => Promise<SourceTrackPage>;

/** Le liste sono in ordine di affinità. Anche i ripieghi rispettano la stessa durata. */
export async function collectRadioTracks(
  seed: Track,
  { duration, signal }: TrackRadioParams,
  lists: RadioPage[],
): Promise<Track[]> {
  const seen = new Set([seed.uid]);
  const suggestions: Track[] = [];
  let failure: unknown;
  for (const readPage of lists) {
    for (let page = 0; page < PAGES_PER_LIST; page++) {
      if (signal?.aborted) throw cancelledError(TRACK_PLAYLIST_TITLE);
      if (!isSourceAvailable(seed.source)) return [];
      let result: SourceTrackPage;
      try {
        result = await readPage({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, signal });
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
        // Un endpoint può cadere mentre gli altri elenchi del catalogo rispondono.
        failure = error;
        break;
      }
      if (signal?.aborted) throw cancelledError(TRACK_PLAYLIST_TITLE);
      if (!isSourceAvailable(seed.source)) return [];
      const { tracks, hasMore } = result;
      for (const track of tracks) {
        if (seen.has(track.uid) || (duration && !matchesDuration(track.durationSec, duration)))
          continue;
        seen.add(track.uid);
        suggestions.push(track);
        if (suggestions.length === SUGGESTIONS) return suggestions;
      }
      if (!hasMore) break;
    }
  }
  if (!suggestions.length && failure) throw failure;
  return suggestions;
}
