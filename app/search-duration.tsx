import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRACK_PLAYLIST_TITLE } from '@/services/sources/trackRadio';
import { durationFromMinutes, durationLabel, THREE_MINUTES } from '@/services/trackSearch';
import { setSearchDuration, useSearchSelection } from '@/store/searchSelection';
import { colors, radius, spacing, touch, type } from '@/theme';
import type { TrackDurationRange } from '@/types/track';
import { PressableScale } from '@/components/PressableScale';

const PRESETS: (TrackDurationRange | undefined)[] = [
  undefined,
  THREE_MINUTES,
  { minSec: 240, maxSec: 420 },
  { minSec: 600 },
];
const label = (duration?: TrackDurationRange) =>
  duration ? durationLabel(duration) : 'Tutte le durate';

export default function SearchDurationScreen() {
  const router = useRouter();
  const { duration } = useSearchSelection();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const minimumInput = useRef<TextInput>(null);
  const maximumInput = useRef<TextInput>(null);
  const [minimum, setMinimum] = useState(
    duration && (duration.minSec > 0 || duration.maxSec === undefined)
      ? String(duration.minSec / 60)
      : '',
  );
  const [maximum, setMaximum] = useState(duration?.maxSec ? String(duration.maxSec / 60) : '');
  const [focused, setFocused] = useState<'minimum' | 'maximum' | null>(null);
  const custom = durationFromMinutes(minimum, maximum);
  const invalid = Boolean(minimum || maximum) && !custom;

  function onClose() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/search');
  }

  function apply(range?: TrackDurationRange) {
    setSearchDuration(range);
    onClose();
  }

  return (
    <KeyboardAvoidingView
      enabled
      behavior="padding"
      keyboardVerticalOffset={insets.top}
      style={styles.overlay}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Durata dei brani
          </Text>
          <Pressable
            style={touch.target}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Chiudi il filtro durata"
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          onLayout={() => {
            if (minimumInput.current?.isFocused() || maximumInput.current?.isFocused())
              scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          <Text style={styles.explanation}>Vale anche per «{TRACK_PLAYLIST_TITLE}».</Text>
          <View style={styles.presets} accessibilityRole="radiogroup">
            {PRESETS.map((range) => {
              const checked =
                !invalid && range?.minSec === custom?.minSec && range?.maxSec === custom?.maxSec;
              const name = label(range);
              return (
                <Pressable
                  key={name}
                  onPress={() => apply(range)}
                  style={({ pressed }) => [
                    styles.preset,
                    (width < 340 || fontScale >= 1.5) && styles.fullWidth,
                    checked && styles.selected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked }}
                  accessibilityLabel={name}
                >
                  <Ionicons
                    name={checked ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={checked ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.presetText, checked && styles.activeText]}>
                    {range ? durationLabel(range, 'short') : name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.custom}>
            <Text accessibilityRole="header" style={styles.subheading}>
              Intervallo personalizzato
            </Text>
            <Text style={styles.explanation}>Imposta uno o entrambi i limiti, in minuti.</Text>
            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Minimo</Text>
                <TextInput
                  ref={minimumInput}
                  value={minimum}
                  onChangeText={setMinimum}
                  onFocus={() => setFocused('minimum')}
                  onBlur={() => setFocused(null)}
                  inputMode="numeric"
                  selectTextOnFocus
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => maximumInput.current?.focus()}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.accentDim}
                  cursorColor={colors.accent}
                  selectionHandleColor={colors.accent}
                  style={[styles.input, focused === 'minimum' && styles.focus]}
                  accessibilityLabel="Durata minima in minuti"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Massimo</Text>
                <TextInput
                  ref={maximumInput}
                  value={maximum}
                  onChangeText={setMaximum}
                  onFocus={() => setFocused('maximum')}
                  onBlur={() => setFocused(null)}
                  inputMode="numeric"
                  selectTextOnFocus
                  placeholder="Nessun limite"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.accentDim}
                  cursorColor={colors.accent}
                  selectionHandleColor={colors.accent}
                  style={[styles.input, focused === 'maximum' && styles.focus]}
                  accessibilityLabel="Durata massima in minuti"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (custom) apply(custom);
                  }}
                />
              </View>
            </View>
            {invalid ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                Usa minuti interi. Il massimo deve essere positivo e almeno pari al minimo.
              </Text>
            ) : null}
            <PressableScale
              onPress={() => {
                if (custom) apply(custom);
              }}
              disabled={!custom}
              accessibilityRole="button"
              accessibilityState={{ disabled: !custom }}
              style={[styles.apply, !custom && styles.applyOff]}
              haptic="tap"
            >
              <Text style={[styles.applyText, !custom && styles.inactiveText]}>
                Applica intervallo
              </Text>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  selected: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  activeText: { color: colors.accent },
  pressed: { backgroundColor: colors.surfaceHigh },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000AA' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  title: { ...type.title, flex: 1, color: colors.text },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  explanation: { ...type.body, color: colors.textMuted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.target.minHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  fullWidth: { flexBasis: '100%' },
  presetText: { ...type.label, color: colors.text, flexShrink: 1 },
  custom: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.lg,
  },
  subheading: { ...type.label, color: colors.text },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flex: 1, minWidth: 100, gap: spacing.xs },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  input: {
    ...type.body,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    minHeight: touch.target.minHeight,
  },
  focus: { borderColor: colors.accent },
  error: { ...type.caption, color: colors.danger },
  apply: {
    minHeight: touch.target.minHeight,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  applyText: { ...type.label, color: colors.bg },
  applyOff: { backgroundColor: colors.surfaceHigh },
  inactiveText: { color: colors.textMuted },
});
