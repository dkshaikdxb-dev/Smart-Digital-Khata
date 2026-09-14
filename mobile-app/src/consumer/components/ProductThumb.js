import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { resolveImageUrl } from '../consumerApi';
import { useDataSaver } from '../lib/dataSaver';

// ONE product thumbnail for the whole consumer app — the shop catalogue, the
// cart lines and the cross-shop product search all render this, so the data
// saver flag and the picture fallback cannot drift apart between screens.
//
// Two rules, both taken from the web PWA's components/ProductThumb.js:
//
// 1. Data saver ON means no image request is made AT ALL. Not a smaller image,
//    not a lazy one — the whole point is the bytes, so we never hand a URI to
//    <Image>, which is what actually starts the fetch.
// 2. When there is no picture (off, missing, or failed) we show a CATEGORY
//    emoji derived from the product name, not one generic bag glyph. A shopper
//    who does not read still has to tell rice from soap from cooking oil, and
//    twenty identical tiles in a list tell them nothing.

// Kirana keywords -> emoji. Mirrors the web's EMOJI_RULES exactly, including
// the order: the first matching group wins, so the specific groups (atta/besan)
// sit above the broad ones.
const EMOJI_RULES = [
  { emoji: '🍚', words: ['rice', 'basmati', 'poha'] },
  { emoji: '🌾', words: ['atta', 'flour', 'maida', 'besan', 'sooji', 'rava'] },
  { emoji: '🛢️', words: ['oil', 'ghee'] },
  { emoji: '🫘', words: ['dal', 'rajma', 'chana', 'moong', 'urad', 'masoor', 'toor'] },
  { emoji: '🍬', words: ['sugar', 'jaggery'] },
  { emoji: '🧂', words: ['salt'] },
  { emoji: '🍵', words: ['tea'] },
  { emoji: '☕', words: ['coffee', 'bru'] },
  { emoji: '🧈', words: ['milk', 'butter', 'amul', 'bournvita', 'dairy'] },
  { emoji: '🍪', words: ['biscuit', 'parle', 'marie', 'good day', 'cookie'] },
  { emoji: '🍜', words: ['noodle', 'maggi'] },
  { emoji: '🍿', words: ['kurkure', 'namkeen', 'snack', 'chips'] },
  { emoji: '🧼', words: ['soap', 'lifebuoy', 'lux'] },
  { emoji: '🧴', words: ['detergent', 'surf', 'vim', 'dishwash'] },
  { emoji: '🪥', words: ['toothpaste', 'colgate'] },
  { emoji: '🧽', words: ['harpic', 'cleaner', 'toilet'] },
  { emoji: '🪔', words: ['agarbatti', 'incense'] },
  { emoji: '🦟', words: ['mosquito', 'good knight'] },
  { emoji: '🥜', words: ['peanut', 'groundnut', 'moongfali', 'mungfali'] },
  { emoji: '🍞', words: ['bread', 'bun', 'pav'] },
  { emoji: '🥚', words: ['egg', 'anda'] },
  { emoji: '💧', words: ['water', 'pani'] },
  { emoji: '🧻', words: ['tissue', 'napkin', 'toilet paper'] },
  { emoji: '🌶️', words: ['chilli', 'turmeric', 'haldi', 'masala', 'jeera', 'cumin', 'coriander', 'dhania', 'pepper', 'mustard', 'rai', 'spice'] },
];

export function categoryEmoji(name) {
  const n = String(name || '').toLowerCase();
  for (let i = 0; i < EMOJI_RULES.length; i += 1) {
    const rule = EMOJI_RULES[i];
    if (rule.words.some((w) => n.includes(w))) return rule.emoji;
  }
  return '🛒';
}

// Match on the display name PLUS the all-language search blob the API sends
// (English + romanized aliases) when it is present, so a localized name like
// "फुल क्रीम दूध" still resolves to 🧈 through its 'milk' token instead of
// falling all the way through to the generic tile.
function emojiFor(product) {
  const parts = [product && product.name, product && product.search_text].filter(Boolean);
  return categoryEmoji(parts.join(' '));
}

export default function ProductThumb({ product, size = 56, style }) {
  const [failed, setFailed] = useState(false);
  const { dataSaver } = useDataSaver();
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.21) };
  const uri = dataSaver ? null : resolveImageUrl(product && product.image_url);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.tile, box, style]}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View style={[styles.tile, styles.fallback, box, style]}>
      <Text
        style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) }}
        // The emoji stands in for a photo, so it is decorative: the product
        // name is already read out by the row next to it.
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {emojiFor(product)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.cardAlt },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
