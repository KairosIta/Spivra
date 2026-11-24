import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '@/theme';

export function Shelf({
  icon,
  label,
  detail,
  tint,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  tint?: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.shelf,
        pressed && styles.shelfPressed,
        disabled && styles.shelfOff,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <View style={styles.shelfIcon}>
        <Ionicons name={icon} size={22} color={tint ?? colors.textMuted} />
      </View>
      <View style={styles.shelfMeta}>
        <Text numberOfLines={2} style={styles.shelfLabel}>
          {label}
        </Text>
        <Text style={styles.shelfDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  shelfPressed: { backgroundColor: colors.surface },
  shelfOff: { opacity: 0.4 },
  shelfIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelfMeta: { flex: 1, gap: 2 },
  shelfLabel: { ...type.body, color: colors.text },
  shelfDetail: { ...type.caption, color: colors.textMuted },
});
