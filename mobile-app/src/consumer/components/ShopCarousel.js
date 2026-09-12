import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Image, FlatList, Pressable, StyleSheet, Linking, useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import api, { resolveImageUrl } from '../consumerApi';
import { useDataSaver } from '../lib/dataSaver';
import { useT } from '../i18n';

// Storefront slider for the native consumer app (batch LITE → FULL). Renders a
// shop's `slides` from GET /public/shops/:id — the owner's up-to-3 moderated
// photos plus AT MOST ONE server-composed sponsored slide in the second slot —
// and falls back to the legacy `images` ([{ url }], photos only) when `slides`
// is absent. Deliberately lightweight for weak 2G rural connections:
//
//   0 slides   -> nothing
//   1 slide    -> a plain image (or the lone sponsored card), no carousel chrome
//   2+ slides  -> a horizontal paging FlatList + dots, swipe only (no
//                 auto-advance timer — lighter on battery and less data)
//
// Offscreen slides are NOT mounted until swiped to (initialNumToRender=1 +
// windowSize=2), so their bytes are never fetched unless the shopper asks.
// DATA-SAVER-AWARE: when the flag is on, ONLY the first OWNER photo is rendered
// — never the sponsored slide — and nothing else is mounted or fetched.
//
// The sponsored card fires the SAME public beacons as the web discovery band
// (POST /api/public/promos/:id/impression once when it becomes visible, /click
// on tap) and follows the same link rule: shop/product → that shop's page,
// url → the system browser, none → no-op. Beacons are best-effort.

const MAX_PHOTOS = 3;
const ASPECT = 20 / 9;

// "Sponsored" label per app language. The consumer i18n dictionary is outside
// this component's remit, so the label is kept local (mirrors the web app's
// c.promo.sponsored strings); unknown languages fall back to English.
const SPONSORED_LABEL = {
  en: 'Sponsored', hi: 'प्रचार', bn: 'স্পনসর্ড', ta: 'விளம்பரம்', te: 'ప్రచారం',
  kn: 'ಪ್ರಚಾರ', ml: 'പരസ്യം', mr: 'प्रायोजित', gu: 'પ્રાયોજિત', ur: 'اشتہار',
};

// Best-effort impression/click beacon on the SAME endpoints the web app uses.
// Never awaited, never throws into the UI.
function fireBeacon(id, kind) {
  if (!id) return;
  try {
    api.post(`/api/public/promos/${encodeURIComponent(id)}/${kind}`).catch(() => {});
  } catch (e) { /* best-effort */ }
}

// Normalize props into one slide list: `slides` when present, else the legacy
// `images` as photo slides. Photo urls are resolved against the API base here;
// anything without a usable url / campaign id is dropped.
function toSlides(slides, images) {
  let list;
  if (Array.isArray(slides)) {
    list = slides
      .map((s) => {
        if (!s) return null;
        if (s.type === 'photo') {
          const uri = resolveImageUrl(s.url);
          return uri ? { type: 'photo', uri } : null;
        }
        if (s.type === 'sponsored' && s.campaign_id) return { ...s, type: 'sponsored' };
        return null;
      })
      .filter(Boolean);
  } else {
    list = (Array.isArray(images) ? images : [])
      .map((im) => resolveImageUrl(im && im.url))
      .filter(Boolean)
      .map((uri) => ({ type: 'photo', uri }));
  }
  // Cap the OWNER photos at MAX_PHOTOS; the (single) sponsored slide is extra.
  let photos = 0;
  return list.filter((s) => {
    if (s.type !== 'photo') return true;
    photos += 1;
    return photos <= MAX_PHOTOS;
  });
}

const slideKey = (s, i) => (s.type === 'sponsored' ? `sp:${s.campaign_id}` : `${i}:${s.uri}`);

// A single photo slide. Mirrors ProductThumb: a neutral placeholder tile on
// load error instead of a broken image.
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

// The sponsored card: a two-tone accent wash (layered Views — no gradient
// dependency), glyph, localized title / offer / subtitle and the Sponsored tag.
// Same box as a photo so the slider never jumps.
function SponsoredSlide({ s, width, height, label, onPress }) {
  const [failed, setFailed] = useState(false);
  const uri = resolveImageUrl(s.image_url);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.img, styles.sponsored, { width, height }, pressed && styles.sponsoredPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${s.title || ''}`}
    >
      <View style={styles.sponsoredWash} pointerEvents="none" />
      <View style={styles.sponsoredRow}>
        <View style={styles.sponsoredMedia}>
          {uri && !failed ? (
            <Image source={{ uri }} style={styles.sponsoredImg} resizeMode="cover" onError={() => setFailed(true)} />
          ) : (
            <Text style={styles.sponsoredGlyph}>{s.glyph || '📣'}</Text>
          )}
        </View>
        <View style={styles.sponsoredBody}>
          {s.offer_text ? <Text style={styles.sponsoredOffer} numberOfLines={1}>{s.offer_text}</Text> : null}
          {s.title ? <Text style={styles.sponsoredTitle} numberOfLines={2}>{s.title}</Text> : null}
          {s.subtitle ? <Text style={styles.sponsoredSub} numberOfLines={1}>{s.subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sponsoredTag} pointerEvents="none">
        <Text style={styles.sponsoredTagText}>{label}</Text>
      </View>
    </Pressable>
  );
}

const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

export default function ShopCarousel({ slides, images, alt = '' }) {
  const { dataSaver } = useDataSaver();
  const { lang } = useT();
  const navigation = useNavigation();
  const { width: screenW } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const firedRef = useRef(new Set()); // campaign ids that already sent an impression

  const list = toSlides(slides, images);
  // Data saver: ONLY the first owner photo — never the sponsored slide — and do
  // NOT load the others.
  const shown = dataSaver ? list.filter((s) => s.type === 'photo').slice(0, 1) : list;
  const sponsoredLabel = SPONSORED_LABEL[lang] || SPONSORED_LABEL.en;

  // Full width minus the screen's horizontal padding (matches shopHeader).
  const width = Math.max(0, screenW - sizes.pad * 2);
  const height = Math.round(width / ASPECT);

  // Impression: once per campaign per mount, when its slide is at least 60%
  // visible (FlatList viewability) — or immediately when it is the only slide.
  const fireImpression = useCallback((s) => {
    if (!s || s.type !== 'sponsored') return;
    if (firedRef.current.has(s.campaign_id)) return;
    firedRef.current.add(s.campaign_id);
    fireBeacon(s.campaign_id, 'impression');
  }, []);

  // Tap → click beacon then the shared link rule.
  const onSponsoredPress = useCallback((s) => {
    fireBeacon(s.campaign_id, 'click');
    const type = s.link_type;
    if ((type === 'shop' || type === 'product') && s.link_shop_id) {
      // A product link opens the seller's shop page (no standalone product
      // screen exists), exactly like the web app.
      const params = { shopId: s.link_shop_id, shopName: s.title || '' };
      if (typeof navigation.push === 'function') navigation.push('ShopDetail', params);
      else navigation.navigate('ShopDetail', params);
    } else if ((type === 'url' || type === 'brand') && s.link_url) {
      Linking.openURL(s.link_url).catch(() => {});
    }
    // 'none' (or a link with no usable target) → no-op.
  }, [navigation]);

  // The lone-slide render has no FlatList (no viewability events): count the
  // sponsored card as seen once it is painted.
  const loneSponsored = shown.length === 1 && shown[0].type === 'sponsored' ? shown[0] : null;
  const loneId = loneSponsored ? loneSponsored.campaign_id : null;
  useEffect(() => {
    if (loneId) fireImpression({ type: 'sponsored', campaign_id: loneId });
  }, [loneId, fireImpression]);

  const shownRef = useRef(shown);
  shownRef.current = shown;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length) {
      const i = viewableItems[0].index;
      if (typeof i === 'number') setActiveIndex(i);
      viewableItems.forEach((v) => {
        const s = v && v.item ? v.item : null;
        if (s && s.type === 'sponsored' && !firedRef.current.has(s.campaign_id)) {
          firedRef.current.add(s.campaign_id);
          fireBeacon(s.campaign_id, 'impression');
        }
      });
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
    const only = shown[0];
    return (
      <View style={styles.wrap}>
        {only.type === 'sponsored' ? (
          <SponsoredSlide s={only} width={width} height={height} label={sponsoredLabel} onPress={() => onSponsoredPress(only)} />
        ) : (
          <Slide uri={only.uri} width={width} height={height} label={alt} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={shown}
        keyExtractor={slideKey}
        renderItem={({ item, index }) => (
          item.type === 'sponsored' ? (
            <SponsoredSlide
              s={item}
              width={width}
              height={height}
              label={sponsoredLabel}
              onPress={() => onSponsoredPress(item)}
            />
          ) : (
            <Slide
              uri={item.uri}
              width={width}
              height={height}
              label={alt ? `${alt} ${index + 1}/${shown.length}` : ''}
            />
          )
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
        {shown.map((s, i) => (
          <View
            key={slideKey(s, i)}
            style={[
              styles.dot,
              s.type === 'sponsored' && styles.dotSponsored,
              i === activeIndex && styles.dotActive,
            ]}
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
  // Sponsored card: accent-dark base + a translucent wash across the top-left so
  // it reads as a soft gradient without a gradient dependency.
  sponsored: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentDark,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sponsoredPressed: { opacity: 0.85 },
  sponsoredWash: {
    position: 'absolute', left: 0, top: 0, right: '35%', bottom: 0,
    backgroundColor: colors.accentDark, opacity: 0.35,
  },
  sponsoredRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 64 },
  sponsoredMedia: {
    width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.accentDark,
  },
  sponsoredImg: { width: '100%', height: '100%' },
  sponsoredGlyph: { fontSize: 32, lineHeight: 38 },
  sponsoredBody: { flex: 1, minWidth: 0, gap: 2 },
  sponsoredOffer: { color: colors.accent, fontSize: 20, fontWeight: '800' },
  sponsoredTitle: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  sponsoredSub: { color: colors.textMuted, fontSize: 13 },
  sponsoredTag: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  sponsoredTagText: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
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
  // The sponsored slide's dot is hollow so a shopper can tell it apart.
  dotSponsored: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 18, borderColor: colors.accent },
});
