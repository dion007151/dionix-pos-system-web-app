import { db } from '../db/db';

export interface ProductImageSuggestion {
  imageUrl: string;
  productName: string;
  brands?: string;
  source: 'open-food-facts' | 'catalog';
}

interface CachedImageLookup {
  savedAt: number;
  suggestion: ProductImageSuggestion | null;
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

export async function lookupProductImageByBarcode(barcode: string, retry = false, expectedName = '', store = ''): Promise<ProductImageSuggestion | null> {
  const code = barcode.trim().replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(code)) return null;

  const cacheKey = `product_image_lookup:${code}`;
  if (!retry) {
    const cached = await db.settings.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.value) as CachedImageLookup;
        if (Date.now() - parsed.savedAt < CACHE_TTL) return parsed.suggestion;
      } catch {
        // Ignore stale cache entries and request a fresh result.
      }
    }
  }

  const response = await fetch(`/api/product-image?barcode=${encodeURIComponent(code)}&name=${encodeURIComponent(expectedName)}&store=${encodeURIComponent(store)}`);
  if (!response.ok) throw new Error('Image lookup is temporarily unavailable.');
  const result = await response.json() as { suggestion: ProductImageSuggestion | null };
  const suggestion = result.suggestion?.source === 'open-food-facts' && result.suggestion.imageUrl
    ? result.suggestion
    : null;

  try {
    await db.settings.put({
      key: cacheKey,
      value: JSON.stringify({ savedAt: Date.now(), suggestion } satisfies CachedImageLookup)
    });
  } catch {
    // A cache write must never block the user from accepting a valid image.
  }
  return suggestion;
}

export async function lookupProductImageByName(name: string, retry = false, store = ''): Promise<ProductImageSuggestion | null> {
  const normalizedName = name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (normalizedName.length < 4) return null;
  const normalizedStore = store.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const cacheKey = `product_image_name:${normalizedStore}:${normalizedName.slice(0, 80)}`;
  if (!retry) {
    const cached = await db.settings.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.value) as CachedImageLookup;
        if (Date.now() - parsed.savedAt < CACHE_TTL) return parsed.suggestion;
      } catch {
        // Ignore stale cache entries and request a fresh result.
      }
    }
  }

  const now = Date.now();
  const lastRequest = await db.settings.get('product_image_name_last_request');
  if (lastRequest && now - Number(lastRequest.value) < 7000) return null;
  try {
    await db.settings.put({ key: 'product_image_name_last_request', value: String(now) });
  } catch {
    // Continue; the provider and this form's debounce remain the primary safeguards.
  }

  const response = await fetch(`/api/product-image?name=${encodeURIComponent(normalizedName)}&store=${encodeURIComponent(normalizedStore)}`);
  if (!response.ok) throw new Error('Image lookup is temporarily unavailable.');
  const result = await response.json() as { suggestion: ProductImageSuggestion | null };
  const suggestion = result.suggestion?.source === 'open-food-facts' && result.suggestion.imageUrl
    ? result.suggestion
    : null;
  try {
    await db.settings.put({
      key: cacheKey,
      value: JSON.stringify({ savedAt: Date.now(), suggestion } satisfies CachedImageLookup)
    });
  } catch {
    // Cache failures should never prevent image confirmation or product entry.
  }
  return suggestion;
}

export async function resizeProductImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Image must be smaller than 12 MB.');

  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This image could not be opened.')); };
    image.src = objectUrl;
  });

  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
