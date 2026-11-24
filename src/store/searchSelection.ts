import { useSyncExternalStore } from 'react';
import { parseTrackSearch } from '@/services/trackSearch';
import type { TrackDurationRange } from '@/types/track';

function selection(input: string, pickedDuration?: TrackDurationRange) {
  const draft = parseTrackSearch(input);
  return {
    input,
    draft,
    pickedDuration,
    duration: draft.duration ?? pickedDuration,
  };
}

// La radio può aprirsi dal player o dalla libreria anche dopo aver lasciato Cerca.
let state = selection('');
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSearchSelection = () => state;
export const useSearchSelection = () => useSyncExternalStore(subscribe, getSearchSelection);

function update(input: string, pickedDuration?: TrackDurationRange): void {
  state = selection(input, pickedDuration);
  listeners.forEach((listener) => listener());
}

export function setSearchInput(input: string): void {
  update(input, state.pickedDuration);
}

/** Il pannello sostituisce anche un intervallo scritto direttamente nel campo. */
export function setSearchDuration(duration?: TrackDurationRange): void {
  update(state.draft.duration ? state.draft.query : state.input, duration);
}

/** Un esempio o una ricerca recente riapre la propria durata. */
export function recallSearch(input: string): void {
  update(input);
}
