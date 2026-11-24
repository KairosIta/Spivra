import { useSyncExternalStore } from 'react';
import {
  distinctStations,
  parseStation,
  sameRadioStation,
  type RadioStation,
} from '@/services/liveRadio';
import { readJSON, writeJSON } from '@/services/storage';

const KEY = 'radio.favorites.v1';
const saved = readJSON(KEY);
let favorites = distinctStations(
  Array.isArray(saved) ? saved.map(parseStation).filter((s) => s !== null) : [],
);
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useRadioFavorites = () => useSyncExternalStore(subscribe, () => favorites);

export function toggleRadioFavorite(station: RadioStation): void {
  favorites = favorites.some((s) => sameRadioStation(s, station))
    ? favorites.filter((s) => !sameRadioStation(s, station))
    : [station, ...favorites];
  writeJSON(KEY, favorites);
  listeners.forEach((l) => l());
}
