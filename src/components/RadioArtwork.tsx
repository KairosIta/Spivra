import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RadioStation } from '@/services/liveRadio';
import { radioBrandOf } from '@/services/radioBranding';
import { colors, radius } from '@/theme';

export function RadioArtwork({
  station,
  variant,
}: {
  station: RadioStation | null;
  variant: 'banner' | 'tile';
}) {
  const brand = radioBrandOf(station);
  const tile = variant === 'tile';
  const uri = tile ? (brand?.thumbnail ?? brand?.banner) : brand?.banner;
  const [loadedUri, setLoadedUri] = useState<string>();
  return (
    <View
      style={[
        styles.frame,
        tile ? styles.tile : styles.banner,
        brand && { backgroundColor: brand.background },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {(!uri || loadedUri !== uri) && (
        <Ionicons
          name="radio-outline"
          size={tile ? 23 : 36}
          color={brand ? (brand.darkInk ? colors.bg : '#FFFFFF') : colors.textMuted}
        />
      )}
      {uri && (
        <Image
          key={uri}
          source={uri}
          style={brand?.padded ? styles.inset : StyleSheet.absoluteFill}
          contentFit={tile ? 'contain' : brand?.fit}
          cachePolicy="memory"
          recyclingKey={uri}
          accessible={false}
          onLoad={() => setLoadedUri(uri)}
          onError={() => setLoadedUri(undefined)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  tile: { width: 44, height: 44, borderRadius: radius.md },
  banner: { width: '100%', aspectRatio: 1.92 },
  inset: { position: 'absolute', top: '12%', bottom: '12%', left: '10%', right: '10%' },
});
