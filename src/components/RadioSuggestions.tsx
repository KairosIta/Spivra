import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { player } from '@/player';
import { onAppActive } from '@/services/appState';
import { haptics } from '@/services/haptics';
import { enqueueRadioTracks, radioQueueIds } from '@/services/radioQueue';
import { trackRadio } from '@/services/sources';
import { SOURCE_META } from '@/services/sources/meta';
import { durationLabel } from '@/services/trackSearch';
import { getSearchSelection } from '@/store/searchSelection';
import { colors, formatTime, radius, spacing, touch, type } from '@/theme';
import type { Track } from '@/types/track';
import { Artwork } from './Artwork';
import { PressableScale } from './PressableScale';
import { Empty, ErrorNotice } from './StateViews';

export function RadioSuggestions({ seed }: { seed: Track }) {
  const [duration] = useState(() => getSearchSelection().duration);
  const [queued, setQueued] = useState(radioQueueIds);
  const [queueError, setQueueError] = useState(false);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['track-radio', seed.uid, duration],
    queryFn: ({ signal }) => trackRadio(seed, { duration, signal }),
  });
  const source = SOURCE_META[seed.source].label;
  const count = data?.length ?? 0;
  const remaining = data?.filter((track) => !queued.has(track.uid)) ?? [];
  const allQueued = remaining.length === 0;
  const action = allQueued
    ? 'Tutti in coda'
    : 'Accoda ' + remaining.length + (remaining.length === 1 ? ' brano' : ' brani');

  useEffect(() => {
    const refresh = () => setQueued(radioQueueIds());
    const stopQueue = player.subscribe('queueChanged', refresh);
    const stopForeground = onAppActive(refresh);
    refresh();
    return () => {
      stopQueue();
      stopForeground();
    };
  }, []);

  function enqueue(tracks: Track[]) {
    try {
      const actual = enqueueRadioTracks(tracks);
      setQueued(actual);
      const complete = tracks.every((track) => actual.has(track.uid));
      setQueueError(!complete);
      if (complete) haptics.success();
    } catch {
      setQueueError(true);
    }
  }

  return (
    <>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View
          accessible
          accessibilityLabel={`Brano di partenza, ${seed.title} di ${seed.artist}, ${source}`}
          style={styles.seed}
        >
          <Artwork
            source={seed.source}
            uri={seed.artworkUrl}
            size={56}
            radius={radius.md}
            recyclingKey={seed.uid}
          />
          <View style={styles.meta}>
            <Text numberOfLines={2} style={styles.seedTitle}>
              {seed.title}
            </Text>
            <Text numberOfLines={2} style={styles.artist}>
              {seed.artist} · {source}
            </Text>
          </View>
        </View>
        <View style={styles.listHeading}>
          <Text accessibilityRole="header" style={styles.listTitle}>
            {count ? `${count} ${count === 1 ? 'suggerimento' : 'suggerimenti'}` : 'Suggerimenti'}
          </Text>
          {duration ? (
            <View style={styles.range}>
              <Ionicons name="time-outline" size={15} color={colors.textMuted} accessible={false} />
              <Text style={styles.duration}>{durationLabel(duration)}</Text>
            </View>
          ) : null}
        </View>
        {isLoading ? (
          <ActivityIndicator
            style={styles.loading}
            color={colors.accent}
            accessibilityLabel="Cerco brani simili"
          />
        ) : null}
        {isError ? (
          <ErrorNotice
            message={`Impossibile caricare i suggerimenti da ${source}.`}
            action={{
              label: 'Riprova',
              onPress: () => {
                void refetch();
              },
              busy: isFetching,
            }}
          />
        ) : null}
        {data?.length === 0 && !isError ? (
          <Empty
            title={
              duration
                ? 'Nessun suggerimento con questa durata'
                : 'Nessun suggerimento per questo brano'
            }
            hint={
              duration
                ? 'Prova un altro brano o cambia la durata in Cerca.'
                : 'Prova a partire da un altro brano.'
            }
          />
        ) : null}
        {data?.map((track) => {
          const added = queued.has(track.uid);
          const time =
            track.durationSec > 0 && Number.isFinite(track.durationSec)
              ? formatTime(track.durationSec)
              : '—';
          return (
            <Pressable
              key={track.uid}
              onPress={() => enqueue([track])}
              disabled={added}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${added ? 'In coda' : 'Accoda'} ${track.title} di ${track.artist}, ${time}`}
              accessibilityState={{ disabled: added }}
            >
              <Artwork
                source={track.source}
                uri={track.artworkUrl}
                size={40}
                recyclingKey={track.uid}
                fade={false}
              />
              <View style={styles.meta}>
                <Text style={styles.title} numberOfLines={2}>
                  {track.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <Text style={styles.duration}>{time}</Text>
              <Ionicons
                name={added ? 'checkmark-circle' : 'add-circle-outline'}
                size={24}
                color={added ? colors.accent : colors.textMuted}
                accessible={false}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      {queueError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          Il player non ha aggiunto tutti i brani. Puoi riprovare.
        </Text>
      ) : null}
      {count > 1 ? (
        <View style={styles.footer}>
          <PressableScale
            onPress={() => enqueue(remaining)}
            disabled={allQueued}
            accessibilityRole="button"
            accessibilityLabel={action}
            accessibilityState={{ disabled: allQueued }}
            style={[styles.bulk, allQueued && styles.complete]}
          >
            <Ionicons
              name={allQueued ? 'checkmark-done' : 'list'}
              size={20}
              color={allQueued ? colors.text : colors.bg}
            />
            <Text style={[styles.bulkText, allQueued && styles.completeText]}>{action}</Text>
          </PressableScale>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  seed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
  },
  seedTitle: { ...type.title, color: colors.text },
  listHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  listTitle: { ...type.label, color: colors.text, flexShrink: 1 },
  range: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  loading: { margin: spacing.xl },
  row: {
    minHeight: touch.target.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.surfaceHigh },
  meta: { flex: 1, gap: 2 },
  title: { ...type.body, color: colors.text },
  artist: { ...type.caption, color: colors.textMuted },
  duration: { ...type.caption, ...type.tabular, color: colors.textMuted, flexShrink: 1 },
  error: {
    ...type.caption,
    color: colors.danger,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  bulk: {
    minHeight: touch.target.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  bulkText: { ...type.label, color: colors.bg, flexShrink: 1 },
  complete: { backgroundColor: colors.surfaceHigh },
  completeText: { color: colors.text },
});
