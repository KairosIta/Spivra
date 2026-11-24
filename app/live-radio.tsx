import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ResumeMusicLink } from '@/components/LiveRadioPlayer';
import { Empty, ErrorNotice } from '@/components/StateViews';
import { RadioStationCard } from '@/components/RadioStationCard';
import { Screen } from '@/components/Screen';
import { useDebounced } from '@/hooks/useDebounced';
import { usePlaybackStatus } from '@/hooks/usePlaybackStatus';
import {
  countStationClick,
  distinctStations,
  ITALIAN_PRESETS,
  liveStationOf,
  matchesStation,
  refreshStations,
  sameRadioStation,
  searchStations,
  type RadioStation,
} from '@/services/liveRadio';
import { resetPlaybackErrorBudget } from '@/services/playbackService';
import { togglePlayback } from '@/services/playerCommands';
import { requestNotificationPermission } from '@/store/notificationPermission';
import { useRadioFavorites } from '@/store/radioFavorites';
import { playStation, useNowPlaying } from '@/store/session';
import { colors, radius, spacing, touch, type } from '@/theme';

function stationRows(stations: RadioStation[], columns: number): RadioStation[][] {
  const rows: RadioStation[][] = [];
  for (let i = 0; i < stations.length; i += columns) rows.push(stations.slice(i, i + columns));
  return rows;
}

export default function RadioScreen() {
  const router = useRouter();
  const favorites = useRadioFavorites();
  const { item } = useNowPlaying();
  const current = liveStationOf(item);
  const status = usePlaybackStatus();
  const [input, setInput] = useState('');
  const term = input.trim();
  const { width, fontScale } = useWindowDimensions();
  const available = width - 2 * spacing.lg;
  const columns = term
    ? 1
    : Math.max(
        1,
        Math.min(
          4,
          Math.floor((available + spacing.md) / (150 * Math.max(1, fontScale) + spacing.md)),
        ),
      );
  const debounced = useDebounced(term);
  const ids = useMemo(
    () => [...new Set([...ITALIAN_PRESETS, ...favorites].map((s) => s.id))].sort(),
    [favorites],
  );
  const catalog = useQuery({
    queryKey: ['radio-stations', ids],
    queryFn: ({ signal }) => refreshStations(ids, signal),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const search = useQuery({
    queryKey: ['radio-search', debounced],
    queryFn: ({ signal }) => searchStations(debounced, signal),
    enabled: debounced.length >= 2 && debounced === term,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const refreshed = new Map(catalog.data?.map((s) => [s.id, s]));
  const latest = (s: RadioStation) => refreshed.get(s.id) ?? s;
  const preferred = distinctStations(favorites.map(latest).filter((s) => matchesStation(s, term)));
  const local = distinctStations([
    ...preferred,
    ...ITALIAN_PRESETS.map(latest).filter((s) => matchesStation(s, term)),
  ]);
  const featured = local.slice(preferred.length);
  const searching = term.length >= 2;
  const remote = searching && term === debounced ? (search.data ?? []) : [];
  const more = distinctStations([...local, ...remote]).slice(local.length);
  const sections = [
    { title: 'Le tue preferite', data: preferred },
    { title: 'In evidenza in Italia', data: featured },
    { title: 'Dal catalogo italiano', data: more },
  ]
    .filter((section) => section.data.length)
    .map(({ title, data }) => ({ title, data: stationRows(data, columns) }));
  const busy = searching && (debounced !== term || search.isFetching);
  const failed = searching ? debounced === term && search.isError : catalog.isError;

  function listen(station: RadioStation) {
    Keyboard.dismiss();
    if (current && sameRadioStation(current, station)) {
      togglePlayback(status);
      return;
    }
    requestNotificationPermission();
    resetPlaybackErrorBudget();
    playStation(station);
    countStationClick(station.id);
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable
          style={touch.target}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Radio in diretta
        </Text>
      </View>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Cerca una radio o un genere"
          accessibilityLabel="Cerca una radio o un genere"
          placeholderTextColor={colors.textMuted}
          maxLength={100}
          autoCorrect={false}
          returnKeyType="search"
        />
        {input ? (
          <Pressable
            style={touch.target}
            accessibilityRole="button"
            accessibilityLabel="Cancella ricerca radio"
            onPress={() => setInput('')}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row[0].id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={current ? <ResumeMusicLink /> : null}
        renderSectionHeader={({ section }) => (
          <Text style={styles.section} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.stations}>
            {row.map((station) => (
              <RadioStationCard
                key={station.id}
                station={station}
                banner={!term}
                status={current && sameRadioStation(current, station) ? status : undefined}
                favorite={favorites.some((s) => sameRadioStation(s, station))}
                onListen={listen}
              />
            ))}
            {Array.from({ length: columns - row.length }, (_, index) => (
              <View key={'space-' + index} style={styles.space} />
            ))}
          </View>
        )}
        ListEmptyComponent={
          !busy && !failed ? (
            <Empty
              title="Nessuna stazione trovata"
              hint="Prova un altro nome o un genere come rock o dance."
            />
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {busy ? (
              <ActivityIndicator
                color={colors.accent}
                accessibilityLabel="Ricerca nel catalogo italiano"
              />
            ) : null}
            {failed ? (
              <ErrorNotice
                message={
                  searching
                    ? 'Ricerca online non disponibile.'
                    : 'Catalogo non aggiornato. Puoi provare le stazioni in elenco.'
                }
                action={{
                  label: 'Riprova',
                  onPress: () => {
                    void (searching ? search : catalog).refetch();
                  },
                }}
              />
            ) : null}
            <Text style={styles.credit}>Catalogo Radio Browser</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  title: { ...type.editorial, color: colors.text, flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
  },
  input: { ...type.body, flex: 1, color: colors.text, minHeight: 48 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  section: { ...type.title, color: colors.text, paddingTop: spacing.md, paddingBottom: spacing.sm },
  stations: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  space: { flex: 1 },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  credit: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
