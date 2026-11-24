import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExternalLink } from '@/components/ExternalLink';
import { PressableScale } from '@/components/PressableScale';
import { RadioArtwork } from '@/components/RadioArtwork';
import { ScreenLink } from '@/components/ScreenLink';
import { usePlaybackStatus } from '@/hooks/usePlaybackStatus';
import { sameRadioStation, type RadioStation } from '@/services/liveRadio';
import { togglePlayback } from '@/services/playerCommands';
import { describeRadioButton, radioStatusText } from '@/services/playbackStatus';
import { resumeRadioMusic, useRadioMusicQueue } from '@/store/session';
import { toggleRadioFavorite, useRadioFavorites } from '@/store/radioFavorites';
import { colors, formatTime, radius, spacing, touch, type } from '@/theme';

export function ResumeMusicLink() {
  const queue = useRadioMusicQueue();
  if (!queue) return null;
  const track = queue.tracks[queue.index];
  return (
    <ScreenLink
      label="Riprendi la mia coda"
      detail={track.title + ' · ' + formatTime(queue.position)}
      onPress={resumeRadioMusic}
    />
  );
}

export function LiveRadioPlayer({
  station,
  liveTitle,
}: {
  station: RadioStation;
  liveTitle?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = usePlaybackStatus();
  const button = describeRadioButton(status);
  const favorite = useRadioFavorites().some((s) => sameRadioStation(s, station));
  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        <PressableScale
          containerStyle={touch.target}
          accessibilityRole="button"
          accessibilityLabel="Chiudi il player"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/live-radio'))}
        >
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </PressableScale>
        <Text style={styles.heading}>Radio in diretta</Text>
        <PressableScale
          containerStyle={touch.target}
          accessibilityRole="checkbox"
          accessibilityLabel={'Preferita, ' + station.name}
          accessibilityState={{ checked: favorite }}
          onPress={() => toggleRadioFavorite(station)}
          haptic="tap"
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={24}
            color={favorite ? colors.accent : colors.textMuted}
          />
        </PressableScale>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.dial}>
          <RadioArtwork station={station} variant="banner" />
        </View>
        <Text style={styles.station} accessibilityRole="header">
          {station.name}
        </Text>
        <Text style={styles.detail}>{station.genre || 'Radio italiana'}</Text>
        <View style={styles.transport}>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {radioStatusText(status)}
          </Text>
          {status === 'playing' && liveTitle ? <Text style={styles.now}>{liveTitle}</Text> : null}
          <PressableScale
            style={styles.play}
            onPress={() => togglePlayback(status)}
            accessibilityRole="button"
            accessibilityLabel={button.label}
            accessibilityState={{ busy: button.busy }}
            haptic="tap"
          >
            {button.busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Ionicons name={button.icon} size={32} color={colors.bg} />
            )}
          </PressableScale>
        </View>
        <ResumeMusicLink />
        <ScreenLink
          label="Scegli un’altra stazione"
          onPress={() => router.dismissTo('/live-radio')}
        />
        {station.homepage ? (
          <ExternalLink label={'Sito di ' + station.name} url={station.homepage} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  heading: { ...type.label, color: colors.textMuted },
  body: { padding: spacing.xl, gap: spacing.sm },
  dial: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  station: { ...type.brand, color: colors.text, textAlign: 'center' },
  detail: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  transport: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  status: { ...type.label, color: colors.accent },
  now: { ...type.body, color: colors.text, textAlign: 'center' },
  play: {
    backgroundColor: colors.accent,
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
