import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type Entity, EntityStrip } from '@/components/EntityStrip';
import { PressableScale } from '@/components/PressableScale';
import { Shelf } from '@/components/Shelf';
import { TrackListSkeleton } from '@/components/Skeleton';
import { Empty, ErrorNotice } from '@/components/StateViews';
import { TrackList } from '@/components/TrackList';
import { useDebounced } from '@/hooks/useDebounced';
import { useInfiniteTracks } from '@/hooks/useInfiniteTracks';
import { searchAlbumsAll, searchAll, searchArtistsAll } from '@/services/sources';
import { failureNotice } from '@/services/sources/meta';
import { durationLabel, orderVersionUploads } from '@/services/trackSearch';
import { clearSearches, rememberSearch, useRecentSearches } from '@/store/searchHistory';
import {
  recallSearch,
  setSearchDuration,
  setSearchInput,
  useSearchSelection,
} from '@/store/searchSelection';
import { colors, radius, spacing, touch, type } from '@/theme';

const PAGE = 25;

export default function SearchScreen() {
  const router = useRouter();
  const { input, draft, duration } = useSearchSelection();
  const query = useDebounced(draft.query, 400);
  const hasQuery = draft.query.length > 1;
  const enabled = hasQuery && query === draft.query;
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const showEntities = !duration || expandedFor === query;
  const recentSearches = useRecentSearches();

  // isLoading (non isFetching): distingue il primo caricamento di una
  // query nuova dal refetch di una gia' vista. Con isFetching la lista
  // spariva e ricompariva a ogni ricarica dalla cache.
  const {
    tracks: pageTracks,
    failed,
    loadMore,
    retry,
    isLoading,
    isFetching,
    isFetchingNextPage,
    emptyPageWithMore,
    error,
  } = useInfiniteTracks(
    ['search', query, duration],
    (cursor, signal) => searchAll({ query, duration }, { limit: PAGE, cursor, signal }),
    { enabled },
  );
  // I due caricamenti possono arrivare in pagine diverse o dalla cache.
  const tracks = useMemo(() => orderVersionUploads(pageTracks, query), [pageTracks, query]);
  const canContinue = Boolean(enabled && duration && emptyPageWithMore);

  // Artisti e album: una pagina sola per ciascuno, alternata fra le
  // sorgenti. Una sorgente senza quella ricerca (Audius per gli album)
  // viene saltata, non contata come caduta.
  const artists = useQuery({
    queryKey: ['search-artists', query],
    queryFn: ({ signal }) => searchArtistsAll(query, { signal }),
    enabled,
  });
  const albums = useQuery({
    queryKey: ['search-albums', query],
    queryFn: ({ signal }) => searchAlbumsAll(query, { signal }),
    enabled,
  });

  const found = tracks.length > 0;

  const artistItems = useMemo<Entity[]>(
    () =>
      (artists.data?.tracks ?? []).map((a) => ({
        key: `${a.source}:${a.id}`,
        title: a.name,
        subtitle: a.detail,
        imageUrl: a.imageUrl,
        source: a.source,
        onPress: () =>
          router.push({
            pathname: '/artist/[source]/[id]',
            params: { source: a.source, id: a.id },
          }),
      })),
    [artists.data, router],
  );

  const albumItems = useMemo<Entity[]>(
    () =>
      (albums.data?.tracks ?? []).map((a) => ({
        key: `${a.source}:${a.id}`,
        title: a.name,
        subtitle: a.artist,
        imageUrl: a.imageUrl,
        source: a.source,
        onPress: () =>
          router.push({ pathname: '/album/[source]/[id]', params: { source: a.source, id: a.id } }),
      })),
    [albums.data, router],
  );

  const hasStrips = artistItems.length > 0 || albumItems.length > 0;
  const recentQuery = duration ? query + ', ' + durationLabel(duration).toLowerCase() : query;
  useEffect(() => {
    if (enabled && (found || hasStrips)) rememberSearch(recentQuery);
  }, [enabled, found, hasStrips, recentQuery]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Cerca</Text>
        <View style={styles.field}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            value={input}
            onChangeText={setSearchInput}
            accessibilityLabel="Titolo, artista, album o genere"
            placeholder="Titolo, artista, album o genere"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accentDim}
            cursorColor={colors.accent}
            selectionHandleColor={colors.accent}
            returnKeyType="search"
            style={styles.input}
            autoCorrect={false}
          />
          {/* Refetch in corso su risultati gia' a schermo: si segnala
              di lato, senza smontare la lista sotto le dita. */}
          {enabled && isFetching && !isLoading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          {input ? (
            <Pressable
              onPress={() => setSearchInput('')}
              style={touch.target}
              accessibilityRole="button"
              accessibilityLabel="Svuota il campo di ricerca"
            >
              <Ionicons name="close-circle" size={19} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.durationBar, duration && styles.selected]}>
          <Pressable
            style={({ pressed }) => [styles.durationButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Durata dei brani, ${duration ? durationLabel(duration) : 'Tutte le durate'}`}
            accessibilityHint="Apre le scelte rapide e l’intervallo personalizzato"
            onPress={() => {
              Keyboard.dismiss();
              router.push('/search-duration');
            }}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={duration ? colors.accent : colors.textMuted}
            />
            <View style={styles.durationLabels}>
              <Text style={duration ? styles.durationValue : styles.durationTitle}>
                Durata dei brani
              </Text>
              {duration ? (
                <Text style={[styles.durationTitle, styles.activeText]}>
                  {durationLabel(duration)}
                </Text>
              ) : null}
            </View>
            {!duration ? <Text style={styles.durationValue}>Tutte</Text> : null}
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
          {duration ? (
            <Pressable
              style={({ pressed }) => [
                touch.target,
                styles.resetDuration,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Rimuovi il filtro durata"
              accessibilityHint="Mostra tutte le durate per questa ricerca"
              onPress={() => setSearchDuration(undefined)}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {enabled && failed.map((f) => <ErrorNotice key={f.source} message={failureNotice(f)} />)}

      <TrackList
        tracks={enabled ? tracks : []}
        onEndReached={enabled && !canContinue ? loadMore : undefined}
        header={
          enabled ? (
            <View>
              {duration && hasStrips ? (
                <View style={styles.resultHead}>
                  {!showEntities && (found || isLoading) ? (
                    <Text accessibilityRole="header" style={styles.resultTitle}>
                      Brani
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => setExpandedFor(showEntities ? null : query)}
                    style={({ pressed }) => [styles.entityToggle, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showEntities }}
                    accessibilityLabel="Artisti e album"
                  >
                    <Text style={styles.chipText}>Artisti e album</Text>
                    <Ionicons
                      name={showEntities ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              ) : null}
              {showEntities ? (
                <>
                  <EntityStrip
                    title="Artisti"
                    shape="circle"
                    items={artistItems}
                    loading={artists.isLoading}
                  />
                  <EntityStrip
                    title="Album"
                    shape="square"
                    items={albumItems}
                    loading={albums.isLoading}
                  />
                </>
              ) : null}
              {showEntities && hasStrips && (found || isLoading) ? (
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Brani
                </Text>
              ) : null}
              {/* La sagoma prende il posto dei brani, non dell'intestazione:
                  l'input resta montato e a fuoco mentre si scrive. */}
              {isLoading ? <TrackListSkeleton rows={8} /> : null}
            </View>
          ) : !input.trim() ? (
            <View>
              <SearchIdeas />
              {recentSearches.length ? (
                <RecentSearches queries={recentSearches} onPick={recallSearch} />
              ) : null}
            </View>
          ) : null
        }
        footer={
          enabled && isFetchingNextPage ? (
            <ActivityIndicator style={styles.more} color={colors.textMuted} />
          ) : canContinue ? (
            <PressableScale
              containerStyle={styles.continueTarget}
              style={styles.filter}
              haptic="tap"
              accessibilityRole="button"
              onPress={loadMore}
            >
              <Text style={styles.chipText}>Cerca in altre pagine</Text>
            </PressableScale>
          ) : null
        }
        empty={
          !hasQuery ? (
            input.trim() ? (
              <Empty title="Scrivi almeno due caratteri" />
            ) : null
          ) : !enabled ? (
            <TrackListSkeleton rows={5} />
          ) : isLoading ? null : error ? (
            // Nessuna sorgente ha risposto: dirlo, invece di far credere
            // che la ricerca non abbia trovato niente.
            <Empty
              title="Le sorgenti non rispondono"
              hint="Controlla la rete e riprova."
              action={{
                label: isFetching ? 'Riprovo...' : 'Riprova',
                onPress: () => {
                  retry();
                },
                busy: isFetching,
              }}
            />
          ) : duration ? (
            <Empty
              title={
                canContinue
                  ? 'Nessun brano di questa durata nelle pagine caricate'
                  : 'Nessun brano con questa durata'
              }
              action={
                canContinue
                  ? undefined
                  : { label: 'Mostra tutte le durate', onPress: () => setSearchDuration(undefined) }
              }
            />
          ) : hasStrips ? null : (
            <Empty
              title={`Nessun risultato per "${query}"`}
              hint="Prova con il nome dell'artista."
            />
          )
        }
      />
    </View>
  );
}

const EXAMPLES = [
  {
    query: 'deep house da 4 a 7 minuti',
    detail: 'Combina un genere e una durata',
    icon: 'time-outline',
  },
  { query: 'jazz live', detail: 'Dà precedenza alle versioni dal vivo', icon: 'mic-outline' },
] as const;

function SearchIdeas() {
  return (
    <View style={styles.ideas}>
      <Text accessibilityRole="header" style={styles.ideasTitle}>
        Prova una ricerca
      </Text>
      {EXAMPLES.map(({ query, detail, icon }) => (
        <Shelf
          key={query}
          onPress={() => recallSearch(query)}
          accessibilityLabel={`Cerca ${query}. ${detail}`}
          icon={icon}
          label={query}
          detail={detail}
        />
      ))}
    </View>
  );
}

/** Le ultime ricerche, da rifare con un tocco quando la casella e' vuota. */
function RecentSearches({ queries, onPick }: { queries: string[]; onPick: (q: string) => void }) {
  return (
    <View style={styles.recent}>
      <View style={styles.recentHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Ricerche recenti
        </Text>
        <Pressable
          onPress={clearSearches}
          style={({ pressed }) => [touch.target, pressed && styles.recentClearPressed]}
          accessibilityRole="button"
          accessibilityLabel="Cancella le ricerche recenti"
        >
          <Text style={styles.recentClear}>Cancella</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {queries.map((q) => (
          <PressableScale
            key={q}
            scaleTo={0.94}
            haptic="tap"
            style={styles.chip}
            containerStyle={styles.chipTarget}
            onPress={() => onPick(q)}
            accessibilityRole="button"
            accessibilityLabel={`Cerca di nuovo ${q}`}
          >
            <Text style={styles.chipText}>{q}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: { ...type.editorial, color: colors.text },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  input: {
    ...type.body,
    color: colors.text,
    flex: 1,
    minHeight: touch.target.minHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  durationBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  durationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.target.minHeight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  durationLabels: { flex: 1 },
  durationTitle: { ...type.label, color: colors.text },
  durationValue: { ...type.caption, color: colors.textMuted },
  selected: { borderColor: colors.accent },
  resetDuration: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  activeText: { color: colors.accent },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  continueTarget: { ...touch.target, alignSelf: 'center', marginTop: spacing.md },
  resultHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  resultTitle: { ...type.title, color: colors.text },
  entityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: touch.target.minHeight,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.surfaceHigh },
  ideas: { paddingVertical: spacing.sm },
  ideasTitle: {
    ...type.title,
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...type.title,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  recent: { paddingBottom: spacing.sm },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
  },
  recentClear: { ...type.caption, color: colors.accent },
  recentClearPressed: { opacity: 0.5 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chipTarget: { minHeight: touch.target.minHeight, maxWidth: '100%', justifyContent: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...type.caption, color: colors.text },
  more: { paddingVertical: spacing.lg },
});
