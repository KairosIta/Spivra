import { player } from '@/player';
import { toMediaItem } from '@/services/mediaItems';
import { isSourceAvailable } from '@/services/sources/access';
import { remember } from '@/store/library';
import {
  activateSession,
  getPendingQueue,
  getRadioMusicQueue,
  insertDuringRadio,
} from '@/store/session';
import { isLiveRadioId } from './liveRadio';
import type { Track } from '@/types/track';

/** La radio mostra anche i brani della sessione ripristinata prima del primo play. */
export function radioQueueIds(): Set<string> {
  if (isLiveRadioId(player.getActiveMediaItem()?.mediaId))
    return new Set(getRadioMusicQueue()?.tracks.map((track) => track.uid));
  const queue = player.getQueue();
  if (queue.length) return new Set(queue.map((item) => item.mediaId));
  return new Set(getPendingQueue()?.tracks.map((track) => track.uid));
}

/** Accoda in ordine i soli suggerimenti mancanti e rilegge ciò che il player ha ricevuto. */
export function enqueueRadioTracks(tracks: readonly Track[]): Set<string> {
  const available = tracks.filter((track) => isSourceAvailable(track.source));
  if (!available.length) return radioQueueIds();

  activateSession({ play: false });
  const present = radioQueueIds();
  const additions: Track[] = [];
  for (const track of available) {
    if (!present.has(track.uid)) {
      present.add(track.uid);
      additions.push(track);
    }
  }
  if (!additions.length) return present;

  remember(additions);
  if (!insertDuringRadio(additions))
    player.insertMediaItems(player.getQueue().length, additions.map(toMediaItem));
  return radioQueueIds();
}
