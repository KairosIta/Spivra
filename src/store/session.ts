import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { type MediaItem, player } from '@/player';
import { isLiveRadioId, stationMediaItem, type RadioStation } from '@/services/liveRadio';
import { toMediaItem, trackFromMediaItem } from '@/services/mediaItems';
import { type IsSourceActive, playableQueue } from '@/services/playableTracks';
import { isSourceAvailable } from '@/services/sources/access';
import { readJSON, writeJSON } from '@/services/storage';
import type { Track } from '@/types/track';
import { remember } from './library';
import { setProgressOverride } from './progress';
import { loadSavedPosition, loadSavedQueue, resumePosition, windowQueue } from './sessionSchema';

/**
 * Sessione di ascolto: la coda e la posizione sopravvivono alla chiusura
 * dell'app. Prima Onda ripartiva sempre vuota, e "riprendi da dove eri"
 * era una promessa della schermata Scopri che nessuno manteneva.
 *
 * La coda vera resta nel player nativo (vedi `queue.tsx`): questo store la
 * fotografa su disco quando cambia e la tiene *in attesa* all'avvio, senza
 * caricarla nel player. Caricarla subito vorrebbe dire aprire lo stream e
 * far comparire la notifica in pausa prima che l'utente abbia toccato
 * niente. Cosi' invece mini-player e player mostrano il brano da disco, e
 * il player nativo lo riceve al primo play, skip o apertura della Coda.
 *
 * Lo store tiene anche il brano attivo del player, al posto di un hook a
 * parte (prima `useActiveMediaItem` di RNTP): "brano attivo" e "coda in
 * attesa" devono cambiare insieme, in un solo snapshot. Con due store
 * separati, nel tick fra la consegna della coda e l'evento del player
 * nessuno dei due avrebbe un brano, il mini-player sparirebbe e il player
 * si chiuderebbe da solo.
 */

const QUEUE_KEY = 'session.queue.v1';
const POSITION_KEY = 'session.position.v1';

interface PendingSession {
  tracks: Track[];
  index: number;
  /** Secondi da cui ripartira' il brano attivo. */
  position: number;
  /** Il brano attivo gia' nella forma che le schermate si aspettano. */
  item: MediaItem;
  /**
   * Consegnata al player ma non ancora confermata da lui: fino al primo
   * `MediaItemTransition` le schermate continuano a mostrare il brano da
   * qui, ma i comandi vanno gia' al player.
   */
  loading: boolean;
}

export interface NowPlaying {
  item: MediaItem | null;
  /**
   * Il brano viene dalla coda ripristinata e il player nativo non lo ha
   * ancora ricevuto: i comandi vanno prima da `activateSession`. Mentre
   * la consegna e' in corso vale gia' `false`.
   */
  pending: boolean;
}

const NOTHING: NowPlaying = { item: null, pending: false };

let active: MediaItem | null = null;
let pending: PendingSession | null = null;
type MusicQueue = Pick<PendingSession, 'tracks' | 'index' | 'position'>;
let beforeRadio: MusicQueue | null = null;
let snapshot: NowPlaying = NOTHING;
let started = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Un solo snapshot per entrambi i segnali; identita' stabile se non cambia niente. */
function publish(): void {
  const next: NowPlaying = active
    ? { item: active, pending: false }
    : pending
      ? { item: pending.item, pending: !pending.loading }
      : NOTHING;
  if (next.item !== snapshot.item || next.pending !== snapshot.pending) snapshot = next;
  listeners.forEach((l) => l());
}

function setPending(next: PendingSession | null): void {
  pending = next;
  const track = next?.tracks[next.index];
  setProgressOverride(
    next && track ? { position: next.position, duration: track.durationSec, buffered: 0 } : null,
  );
  publish();
}

function setActive(next: MediaItem | null): void {
  if (
    beforeRadio &&
    isLiveRadioId(active?.mediaId) &&
    next &&
    !isLiveRadioId(next.mediaId) &&
    !isLiveRadioId(player.getActiveMediaItem()?.mediaId)
  )
    beforeRadio = null;
  active = next;
  // Un brano nel player mentre c'era una coda in attesa: e' la conferma
  // della consegna, oppure il controller connesso in ritardo con il suo
  // brano. In entrambi i casi da qui in poi comanda il player.
  if (next && pending) setPending(null);
  else publish();
}

/**
 * Il brano da mostrare come "in riproduzione": quello del player nativo,
 * oppure quello della coda in attesa dopo un riavvio. Le schermate usano
 * questo e non il brano del player, altrimenti all'avvio non avrebbero
 * niente da mostrare finche' l'utente non preme play.
 */
export function useNowPlaying(): NowPlaying {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** I brani restano consultabili e accodabili anche mentre il player suona una diretta. */
export const getRadioMusicQueue = () => beforeRadio;
export const useRadioMusicQueue = () => useSyncExternalStore(subscribe, getRadioMusicQueue);

function storeRadioMusicQueue(queue: MusicQueue | null): void {
  beforeRadio = queue;
  const savedAt = Date.now();
  writeJSON(QUEUE_KEY, queue && { tracks: queue.tracks, index: queue.index, savedAt });
  writeJSON(
    POSITION_KEY,
    queue && {
      uid: queue.tracks[queue.index].uid,
      position: queue.position,
      savedAt,
      interruptedByRadio: true,
    },
  );
  publish();
}

export function playStation(station: RadioStation): void {
  const current = player.getActiveMediaItem();
  if (!isLiveRadioId(current?.mediaId)) {
    const queue = current ? readPlayerQueue() : pending;
    storeRadioMusicQueue(
      queue && {
        tracks: queue.tracks,
        index: queue.index,
        position: current ? player.getProgress().position : (pending?.position ?? 0),
      },
    );
  }
  clearPending();
  player.setMediaItems([stationMediaItem(station)], 0);
  player.play();
}

/** Restituisce false quando nel frattempo tutti i brani sono diventati indisponibili. */
export function resumeRadioMusic(): boolean {
  if (!isLiveRadioId(player.getActiveMediaItem()?.mediaId)) return false;
  const queue = beforeRadio;
  const playable = queue && playableQueue(queue.tracks, queue.index, isSourceAvailable);
  if (!queue || !playable) return false;
  const sameTrack = queue.tracks[queue.index].uid === playable.tracks[playable.index].uid;
  remember(playable.tracks);
  player.setMediaItems(playable.tracks.map(toMediaItem), playable.index);
  if (sameTrack && queue.position > 0) player.seekTo(queue.position);
  player.play();
  beforeRadio = null;
  publish();
  return true;
}

export function insertDuringRadio(tracks: Track[], next = false): boolean {
  if (!isLiveRadioId(player.getActiveMediaItem()?.mediaId)) return false;
  const queue = beforeRadio ?? { tracks: [], index: 0, position: 0 };
  const updated = [...queue.tracks];
  updated.splice(next ? queue.index + 1 : updated.length, 0, ...tracks);
  if (updated.length) storeRadioMusicQueue({ ...queue, tracks: updated });
  return true;
}

// --- salvataggio -----------------------------------------------------

/**
 * Fotografa la coda del player. Chiamata a ogni transizione e cambio coda,
 * dal processo UI e dal gestore headless: MMKV e' lo stesso file.
 *
 * Una coda vuota non cancella il salvataggio: un player che la svuota
 * fermando il servizio (RNTP lo faceva, togliendo l'app dai recenti) non
 * deve portarsi via la sessione da riprendere all'avvio dopo.
 */
function readPlayerQueue(): Pick<MusicQueue, 'tracks' | 'index'> | null {
  const items = player.getQueue();
  const activeIndex = player.getActiveIndex();
  if (items.length === 0 || activeIndex === null || isLiveRadioId(items[activeIndex]?.mediaId))
    return null;

  const tracks: Track[] = [];
  let index = -1;
  items.forEach((item, i) => {
    const track = trackFromMediaItem(item);
    if (!track) return;
    if (i === activeIndex) index = tracks.length;
    tracks.push(track);
  });
  return index < 0 ? null : { tracks, index };
}

export function saveQueueSnapshot(): void {
  const queue = readPlayerQueue();
  if (queue)
    writeJSON(QUEUE_KEY, { ...windowQueue(queue.tracks, queue.index), savedAt: Date.now() });
}

/**
 * La posizione arriva dal timer nativo del player (`progressUpdated`, vedi
 * setupPlayer): ogni cinque secondi in riproduzione e un ultimo colpo alla
 * pausa, a schermo spento compreso. Niente timer JS da tenere vivi.
 */
export function savePosition(uid: string, position: number): void {
  if (!uid || isLiveRadioId(uid) || !Number.isFinite(position)) return;
  // Un ultimo tick del brano può arrivare dopo il passaggio alla diretta.
  if (beforeRadio && isLiveRadioId(player.getActiveMediaItem()?.mediaId)) return;
  writeJSON(POSITION_KEY, { uid, position, savedAt: Date.now() });
}

// --- ripristino ------------------------------------------------------

/**
 * All'avvio: se il player e' vuoto e c'e' una coda salvata, la mette in
 * attesa. Con il servizio ancora vivo (ricarica del solo JS) il player ha
 * gia' il suo brano e non c'e' niente da riprendere.
 */
export function restoreSession(): void {
  if (active && !isLiveRadioId(active.mediaId)) return;

  const saved = loadSavedQueue(readJSON(QUEUE_KEY), Date.now());
  if (!saved) return;
  // Una sorgente spenta dopo il salvataggio resta fuori anche da qui; se il
  // brano attivo era suo, si riparte dal successivo e da capo.
  const playable = playableQueue(saved.tracks, saved.index, isSourceAvailable);
  if (!playable) return;
  const queue = { ...saved, ...playable };
  const track = queue.tracks[queue.index];
  if (!track) return;

  // Serve al cuoricino e alla cronologia: risolvono l'uid dal catalogo
  // volatile, che a processo appena nato e' vuoto.
  remember(queue.tracks);
  const position = loadSavedPosition(readJSON(POSITION_KEY));
  if (isLiveRadioId(active?.mediaId)) {
    beforeRadio = {
      tracks: queue.tracks,
      index: queue.index,
      position: position?.uid === track.uid ? position.position : 0,
    };
    publish();
    return;
  }
  setPending({
    tracks: queue.tracks,
    index: queue.index,
    position: resumePosition(queue, position),
    item: toMediaItem(track),
    loading: false,
  });
}

/**
 * Una sorgente spenta esce anche dalla coda in attesa (vedi `sourceGuard`).
 * Gia' consegnata al player non e' piu' affare di questo store: la ripulisce
 * il guardiano direttamente nel player.
 */
export function prunePending(isActive: IsSourceActive): void {
  if (beforeRadio && isLiveRadioId(player.getActiveMediaItem()?.mediaId)) {
    const queue = beforeRadio;
    const kept = playableQueue(queue.tracks, queue.index, isActive);
    if (kept?.tracks.length !== queue.tracks.length) {
      storeRadioMusicQueue(
        kept && {
          ...kept,
          position:
            kept.tracks[kept.index].uid === queue.tracks[queue.index].uid ? queue.position : 0,
        },
      );
    }
  }
  if (!pending || pending.loading) return;
  const next = playableQueue(pending.tracks, pending.index, isActive);
  if (!next) {
    setPending(null);
    return;
  }
  if (next.tracks.length === pending.tracks.length) return;
  const track = next.tracks[next.index];
  const same = track.uid === pending.tracks[pending.index]?.uid;
  setPending({
    ...pending,
    tracks: next.tracks,
    index: next.index,
    position: same ? pending.position : 0,
    item: same ? pending.item : toMediaItem(track),
  });
}

/**
 * Carica la coda in attesa nel player, ripartendo dalla posizione salvata.
 * Ritorna `true` se c'era qualcosa da caricare: chi chiama sa cosi' se il
 * comando che voleva dare (play, skip) e' gia' stato assorbito o meno.
 */
export function activateSession({ play }: { play: boolean }): boolean {
  if (!pending) return false;
  const { tracks, index, position } = pending;

  // Gia' consegnata: i comandi al controller sono in ordine, quindi un
  // play accodato adesso parte appena il brano e' pronto.
  if (pending.loading) {
    if (play) player.play();
    return true;
  }

  // Il player ha gia' un brano: la coda in attesa era un residuo (il
  // controller nativo si connette dopo setupPlayer) e va solo dimenticata.
  const live = player.getActiveMediaItem();
  if (live) {
    setActive(live);
    return false;
  }

  setPending({ ...pending, loading: true });
  player.setMediaItems(tracks.map(toMediaItem), index);
  // Il seek si applica al brano appena preparato, prima di un eventuale
  // play; il controller li esegue nell'ordine in cui arrivano.
  if (position > 0) player.seekTo(position);
  if (play) player.play();
  return true;
}

/** Lo slider mosso prima del primo play: si ricorda solo da dove ripartire. */
export function seekPending(position: number): void {
  if (!pending || pending.loading) return;
  savePosition(pending.item.mediaId, position);
  setPending({ ...pending, position });
}

/** La coda in attesa per chi deve mostrarla senza caricarla (la riga "Prossimo"). */
export function getPendingQueue(): { tracks: Track[]; index: number } | null {
  return pending ? { tracks: pending.tracks, index: pending.index } : null;
}

/** Una coda nuova sostituisce quella in attesa. */
export function clearPending(): void {
  if (pending) setPending(null);
}

// --- listener ---------------------------------------------------------

/** Da chiamare una volta dopo setupPlayer, prima di `restoreSession`. */
export function startSessionPersistence(): void {
  if (started) return;
  started = true;

  active = player.getActiveMediaItem();
  publish();

  player.subscribe('mediaItemTransition', ({ item }) => setActive(item));
  player.subscribe('mediaMetadataChanged', () => {
    setActive(player.getActiveMediaItem());
  });

  AppState.addEventListener('change', (status) => {
    if (status === 'active') {
      // In background gli eventi vanno al gestore headless, non qui: al
      // ritorno si rilegge il player invece di fidarsi dell'ultimo evento.
      setActive(player.getActiveMediaItem());
      return;
    }
    // Uscendo dall'app si salva subito la posizione: il timer nativo puo'
    // essere a meta' dei suoi cinque secondi, e se il sistema uccide il
    // processo poco dopo e' l'ultima parola che resta.
    const live = player.getActiveMediaItem();
    if (live?.mediaId) savePosition(live.mediaId, player.getProgress().position);
  });
}
