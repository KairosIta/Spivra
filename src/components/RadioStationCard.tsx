import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { RadioArtwork } from '@/components/RadioArtwork';
import { haptics } from '@/services/haptics';
import type { RadioStation } from '@/services/liveRadio';
import {
  describeRadioButton,
  radioStatusText,
  type PlaybackStatus,
} from '@/services/playbackStatus';
import { toggleRadioFavorite } from '@/store/radioFavorites';
import { colors, motion, radius, spacing, touch, type } from '@/theme';

export function RadioStationCard({
  station,
  banner,
  status,
  favorite,
  onListen,
}: {
  station: RadioStation;
  banner: boolean;
  status?: PlaybackStatus;
  favorite: boolean;
  onListen: (station: RadioStation) => void;
}) {
  const play = describeRadioButton(status ?? 'paused');
  const selected = status !== undefined;
  const detailColor = selected ? colors.accent : colors.textMuted;
  const heart = (
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
        color={favorite ? colors.accent : colors.textMuted}
        size={21}
      />
    </PressableScale>
  );
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        !banner && styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
      unstable_pressDelay={motion.scrollerPressDelay}
      onPress={() => {
        haptics.tap();
        onListen(station);
      }}
      accessibilityRole="button"
      accessibilityLabel={(selected ? play.label + ', ' : 'Ascolta ') + station.name}
      accessibilityHint={station.genre || undefined}
      accessibilityState={{ selected, busy: play.busy }}
    >
      <RadioArtwork station={station} variant={banner ? 'banner' : 'tile'} />
      <View style={banner ? styles.caption : styles.meta}>
        <View style={[styles.titleRow, banner && styles.posterTitle]}>
          <Text style={styles.name} numberOfLines={2}>
            {station.name}
          </Text>
          {banner && heart}
        </View>
        <View style={styles.detail}>
          {play.busy ? (
            <ActivityIndicator size={14} color={detailColor} />
          ) : (
            <Ionicons name={play.icon} size={14} color={detailColor} />
          )}
          <Text style={[styles.genre, { color: detailColor }]} numberOfLines={2}>
            {status ? radioStatusText(status) : station.genre || 'Radio italiana'}
          </Text>
        </View>
      </View>
      {!banner && heart}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  selected: { borderColor: colors.accent },
  pressed: { backgroundColor: colors.surfaceHigh },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  meta: { flex: 1, minWidth: 0, gap: spacing.xs, justifyContent: 'center' },
  caption: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  posterTitle: { marginRight: -spacing.sm },
  name: { ...type.label, color: colors.text, flex: 1 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  genre: { ...type.caption, flexShrink: 1 },
});
