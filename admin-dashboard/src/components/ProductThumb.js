import { useState } from 'react';
import { useDataSaver } from '../lib/useDataSaver';

// A small square product image with an emoji fallback. Non-readers recognise
// goods by picture, so when there is no photo we show a category emoji picked
// from keywords in the product name rather than leaving a blank tile.

const API = process.env.NEXT_PUBLIC_API_URL || '';

// Common kirana keywords → emoji. First matching group wins, so order the more
// specific groups (e.g. besan/atta) before broad ones where it matters.
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
  { emoji: '🌶️', words: ['chilli', 'turmeric', 'haldi', 'masala', 'jeera', 'cumin', 'coriander', 'dhania', 'pepper', 'mustard', 'rai', 'spice'] },
];

export function categoryEmoji(name) {
  const n = String(name || '').toLowerCase();
  for (const rule of EMOJI_RULES) {
    if (rule.words.some((w) => n.includes(w))) return rule.emoji;
  }
  return '🛒';
}

function resolveSrc(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${API}${url}`;
}

export default function ProductThumb({ product, size = 56 }) {
  const [failed, setFailed] = useState(false);
  const { dataSaver } = useDataSaver();
  const src = resolveSrc(product && product.image_url);
  const box = {
    width: size,
    height: size,
    flex: '0 0 auto',
    borderRadius: 10,
    overflow: 'hidden',
  };

  // Data-saver mode: never emit an <img src> — the whole point is to save bytes,
  // so we render the emoji/placeholder tile instead of fetching the photo.
  if (src && !failed && !dataSaver) {
    return (
      <img
        src={src}
        alt={(product && product.name) || ''}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ ...box, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  return (
    <div
      className="pthumb-fallback"
      aria-hidden="true"
      style={{
        ...box,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
      }}
    >
      {categoryEmoji(product && product.name)}
    </div>
  );
}
