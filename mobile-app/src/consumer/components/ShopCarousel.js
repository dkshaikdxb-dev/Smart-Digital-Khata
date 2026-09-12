import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, FlatList, StyleSheet, useWindowDimensions,
} from 'react-native';
import { colors, sizes } from '../theme';
import { resolveImageUrl } from '../consumerApi';
import { useDataSaver } from '../lib/dataSaver';

// Storefront photo carousel for the native consumer app. Renders a shop's
// up-to-3 owner photos (GET /public/shops/:id -> shop.images = [{ url }]).
// Deliberately lightweight for weak 2G rural connections:
//
//   0 photos   -> nothing
//   1 photo    -> a plain image, no carousel chrome
//   2-3 photos -> a horizontal paging FlatList + dots, swipe only (no
//                 auto-advance timer — lighter on battery and less data)
//
// Offscreen slides are NOT mounted until swiped to (initialNumToRender=1 +
// windowSize=2), so their bytes are never fetched unless the shopper asks.
// DATA-SAVER-AWARE: when the flag is on, only the first photo is rendered and
// the rest are never mounted or fetched at all.

const MAX_PHOTOS = 3;
const ASPECT = 20 / 9;

// A single slide. Mirrors ProductThumb: a neutral placeholder tile on load
// error instead of a broken image.
function Slide({ uri, width, height, label }) {
  const [failed, setFailed] = useState(false);
  const box = { width, height };
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.img, box]}
        resizeMode="cover"
        accessible={!!label}
        accessibilityLabel={label || undefined}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.img, styles.placeholder, box]}>
      <Text style={styles.glyph}>🏬</Text>
    </View>
  );
}

const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

export default function ShopCarousel({ images, alt = '' }) {
  const { dataSaver } = useDataSaver();
  const { width: screenW } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const list = (Array.isArray(images) ? images : [])
    .map((im) => resolveImageUrl(im && im.url))
    .filter(Boolean)
    .slice(0, MAX_PHOTOS);
  // Data saver: show only the first photo and do NOT load the others.
  const shown = dataSaver ? list.slice(0, 1) : list;

  // Full width minus the screen's horizontal padding (matches shopHeader).
  const width = Math.max(0, screenW - sizes.pad * 2);
  const height = Math.round(width / ASPECT);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length) {
      const i = viewableItems[0].index;
      if (typeof i === 'number') setActiveIndex(i);
    }
  }).current;

  const onMomentumScrollEnd = useCallback((e) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.min(Math.max(i, 0), shown.length - 1));
  }, [width, shown.length]);

  const getItemLayout = useCallback((_data, index) => (
    { length: width, offset: width * index, index }
  ), [width]);

  if (!shown.length || !width) return null;

  if (shown.length === 1) {
    return (
      <View style={styles.wrap}>
        <Slide uri={shown[0]} width={width} height={height} label={alt} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={shown}
        keyExtractor={(uri, i) => `${i}:${uri}`}
        renderItem={({ item, index }) => (
          <Slide
            uri={item}
            width={width}
            height={height}
            label={alt ? `${alt} ${index + 1}/${shown.length}` : ''}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={2}
        removeClippedSubviews
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={{ width, height, borderRadius: 16, overflow: 'hidden' }}
      />
      <View style={styles.dots} accessibilityRole="tablist">
        {shown.map((uri, i) => (
          <View
            key={`${i}:${uri}`}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: sizes.gap, alignItems: 'center' },
  img: {
    borderRadius: 16,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 40 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent, width: 18 },
});
