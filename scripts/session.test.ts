/// <reference types="node" />

import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { player } from '@/player';
import { toMediaItem } from '@/services/mediaItems';
import { ITALIAN_PRESETS } from '@/services/liveRadio';
import { enqueueRadioTracks, radioQueueIds } from '@/services/radioQueue';
import { NO_CREDENTIALS } from '@/services/sourceSettings';
import { setSourceAccess } from '@/services/sources/access';
import {
  activateSession,
  getRadioMusicQueue,
  insertDuringRadio,
  playStation,
  resumeRadioMusic,
  getPendingQueue,
  restoreSession,
  savePosition,
  saveQueueSnapshot,
  seekPending,
  startSessionPersistence,
} from '@/store/session';
import type { SourceId, Track } from '@/types/track';
import { fakePlayer } from './doubles/player';
import { setAppState } from './doubles/react-native';

/**
 * La sessione di ascolto sopra il player finto: cosa si salva, cosa torna
 * all'avvio e in che ordine la coda in attesa arriva al player.
 */

const track = (source: SourceId, id: string): Track => ({
  uid: `${source}:${id}`,
  source,
  id,
  title: `Traccia ${id}`,
  artist: 'Artista',
  durationSec: 120,
  streamUrl: `https://example.test/${id}.mp3`,
});

const tracks = [track('audius', 'a'), track('audius', 'b'), track('audius', 'c')];

/** La coda in attesa come uid e indice: lo schema riscrive i brani con i campi vuoti. */
function pendingUids(): { uids: string[]; index: number } | null {
  const pending = getPendingQueue();
  return pending && { uids: pending.tracks.map((t) => t.uid), index: pending.index };
}

const active: Record<SourceId, boolean> = { audius: true, jamendo: true };
setSourceAccess({ credentials: () => NO_CREDENTIALS, isActive: (id) => active[id] });

startSessionPersistence();

// Ogni test si chiude consegnando gli eventi rimasti: al test dopo non arriva
// niente di suo.
afterEach(() => {
  fakePlayer.flush();
  fakePlayer.clearCalls();
});

/** Svuota il player come quando il servizio si ferma: la sessione resta su disco. */
function stopPlayer(): void {
  player.setMediaItems([], 0);
  fakePlayer.flush();
}

/** Una coda in riproduzione, salvata, e un riavvio che la rilegge. */
function restartWith(queue: Track[], index: number, position: number): void {
  player.setMediaItems(queue.map(toMediaItem), index);
  fakePlayer.flush();
  saveQueueSnapshot();
  savePosition(queue[index].uid, position);
  stopPlayer();
  restoreSession();
  fakePlayer.clearCalls();
}

test('due dirette e i tick in background conservano la coda attiva e il punto esatto', () => {
  player.setMediaItems(tracks.map(toMediaItem), 1);
  player.seekTo(116);
  fakePlayer.flush();
  playStation(ITALIAN_PRESETS[0]);
  fakePlayer.flush();
  playStation(ITALIAN_PRESETS[1]);
  fakePlayer.flush();
  const radio = player.getActiveMediaItem()!;
  savePosition(radio.mediaId, 32);
  saveQueueSnapshot();
  setAppState('background');
  setAppState('active');
  restoreSession();
  assert.equal(getRadioMusicQueue()?.position, 116);
  assert.equal(resumeRadioMusic(), true);
  assert.deepEqual(
    player.getQueue().map((t) => t.mediaId),
    tracks.map((t) => t.uid),
  );
  assert.equal(player.getActiveIndex(), 1);
  assert.equal(player.getProgress().position, 116);
});

test('dalla coda in attesa si passa alla diretta e si accodano brani senza interromperla', () => {
  restartWith(tracks.slice(0, 2), 1, 42);
  playStation(ITALIAN_PRESETS[0]);
  fakePlayer.flush();
  assert.equal(getPendingQueue(), null);
  assert.deepEqual(
    [...enqueueRadioTracks(tracks)],
    tracks.map((t) => t.uid),
  );
  assert.equal(player.getQueue().length, 1);
  assert.equal(insertDuringRadio([track('audius', 'd')], true), true);
  assert.equal(resumeRadioMusic(), true);
  assert.deepEqual(
    player.getQueue().map((t) => t.mediaId),
    ['audius:a', 'audius:b', 'audius:d', 'audius:c'],
  );
  assert.equal(player.getActiveIndex(), 1);
  assert.equal(player.getProgress().position, 42);
});

test('una diretta partita senza musica accetta il primo brano da riprendere', () => {
  stopPlayer();
  playStation(ITALIAN_PRESETS[0]);
  fakePlayer.flush();
  assert.equal(resumeRadioMusic(), false);
  assert.equal(insertDuringRadio([tracks[0]]), true);
  assert.equal(resumeRadioMusic(), true);
  assert.equal(player.getActiveMediaItem()?.mediaId, tracks[0].uid);
});

test('dopo la chiusura durante una diretta tornano anche gli ultimi secondi del brano interrotto', () => {
  player.setMediaItems(tracks.map(toMediaItem), 1);
  player.seekTo(118);
  fakePlayer.flush();
  playStation(ITALIAN_PRESETS[1]);
  fakePlayer.flush();
  savePosition(tracks[1].uid, 112);
  stopPlayer();
  restoreSession();
  assert.equal(activateSession({ play: true }), true);
  assert.equal(player.getActiveIndex(), 1);
  assert.equal(player.getProgress().position, 118);
});

test('la radio riconosce la coda ripristinata e aggiunge i suggerimenti mancanti senza avviare il player', () => {
  restartWith(tracks.slice(0, 2), 1, 42);
  assert.deepEqual(
    [...radioQueueIds()],
    tracks.slice(0, 2).map((t) => t.uid),
  );
  assert.deepEqual(
    [...enqueueRadioTracks(tracks)],
    tracks.map((t) => t.uid),
  );
  assert.deepEqual(fakePlayer.calls(), ['setMediaItems', 'seekTo', 'insertMediaItems']);
  assert.equal(player.getActiveIndex(), 1);
  assert.equal(player.getProgress().position, 42);
});

test('la sessione salvata torna in attesa senza toccare il player', () => {
  restartWith(tracks, 1, 42);
  assert.deepEqual(pendingUids(), { uids: ['audius:a', 'audius:b', 'audius:c'], index: 1 });
  assert.deepEqual(fakePlayer.calls(), [], 'niente stream e niente notifica prima del play');
});

test("il primo play consegna coda, posizione e play, in quest'ordine", () => {
  restartWith(tracks, 1, 42);
  assert.equal(activateSession({ play: true }), true);
  assert.deepEqual(fakePlayer.calls(), ['setMediaItems', 'seekTo', 'play']);
  assert.deepEqual(fakePlayer.argsOf('seekTo'), [[42]]);
  // Le letture vedono gia' la coda consegnata: "Riproduci dopo" ci conta.
  assert.equal(player.getActiveIndex(), 1);

  assert.notEqual(getPendingQueue(), null, 'fino alla conferma si mostra il brano da disco');
  fakePlayer.flush();
  assert.equal(getPendingQueue(), null, 'confermata dal player, la coda in attesa si ritira');
});

test('un play durante la consegna si accoda e basta', () => {
  restartWith(tracks, 1, 42);
  activateSession({ play: false });
  assert.equal(activateSession({ play: true }), true);
  assert.deepEqual(fakePlayer.calls(), ['setMediaItems', 'seekTo', 'play']);
});

test('lo slider mosso prima del play sposta solo il punto di ripresa', () => {
  restartWith(tracks, 1, 42);
  seekPending(80);
  assert.deepEqual(fakePlayer.calls(), []);
  activateSession({ play: true });
  assert.deepEqual(fakePlayer.argsOf('seekTo'), [[80]]);
});

test('una sorgente spenta resta fuori, e si riparte dal brano dopo da capo', (t) => {
  t.after(() => {
    active.jamendo = true;
  });
  const mixed = [track('audius', 'a'), track('jamendo', 'j'), track('audius', 'b')];
  restartWith(mixed, 1, 42);
  active.jamendo = false;
  restoreSession();

  assert.deepEqual(pendingUids(), { uids: ['audius:a', 'audius:b'], index: 1 });
  activateSession({ play: false });
  assert.deepEqual(fakePlayer.calls(), ['setMediaItems'], 'un brano diverso riparte da capo');
});

test("uscendo dall'app la posizione si salva subito", () => {
  player.setMediaItems([toMediaItem(tracks[0])], 0);
  fakePlayer.flush();
  saveQueueSnapshot();
  player.seekTo(33);
  setAppState('background');
  setAppState('active');

  stopPlayer();
  restoreSession();
  fakePlayer.clearCalls();
  activateSession({ play: false });
  assert.deepEqual(fakePlayer.argsOf('seekTo'), [[33]]);
});
