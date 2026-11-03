export interface OpenFoodFactsImage {
  imageUrl: string;
  productName: string;
  brands?: string;
  source: 'open-food-facts';
}

interface OpenFoodFactsProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  selected_images?: { front?: { display?: Record<string, string>; small?: Record<string, string> } };
  image_front_url?: string;
  image_url?: string;
}

function productTokens(value: string): string[] {
  return value.toLocaleLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(kg|mg|g|ml|cl|l|oz|lb)\b/g, '$1$2')
    .replace(/(\d+)\s*(?:pcs?|pieces?)\b/g, '$1pc')
    .replace(/(\d+)\s*(?:tabs?|tablets?)\b/g, '$1tab')
    .replace(/\btablets?\b/g, 'tablet')
    .match(/[a-z0-9]+/g) || [];
}

function matchesRequestedName(product: OpenFoodFactsProduct, name: string, store: string): boolean {
  const storeTokens = new Set((store.toLocaleLowerCase().match(/[a-z0-9]+/g) || []).filter(token => token.length > 1));
  const wanted = productTokens(name).filter(token => token.length > 1 && !storeTokens.has(token));
  const text = `${product.product_name || ''} ${product.brands || ''} ${product.quantity || ''} ${product.product_quantity || ''}${product.product_quantity_unit || ''}`.toLocaleLowerCase();
  const available = new Set(productTokens(text));
  const matched = wanted.filter(token => available.has(token));
  if (wanted.length < 2 || matched.length < 2 || matched.length / wanted.length < 0.8) return false;
  const requestedSize = name.toLocaleLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|cl|oz|lb)\b/)?.[0].replace(/\s+/g, '');
  if (!requestedSize) return true;
  return text.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|cl|oz|lb)\b/)?.[0].replace(/\s+/g, '') === requestedSize;
}

function safeImage(product: OpenFoodFactsProduct, expectedBarcode?: string, expectedName = '', store = ''): OpenFoodFactsImage | null {
  const imageUrl = product.selected_images?.front?.display?.en
    || product.selected_images?.front?.small?.en
    || Object.values(product.selected_images?.front?.display || {})[0]
    || Object.values(product.selected_images?.front?.small || {})[0]
    || product.image_front_url || product.image_url;
  if (!imageUrl || (expectedBarcode && product.code?.replace(/\s/g, '') !== expectedBarcode)) return null;
  if (expectedName && !matchesRequestedName(product, expectedName, store)) return null;
  try {
    const candidate = new URL(imageUrl);
    if (candidate.protocol !== 'https:' || !(candidate.hostname === 'openfoodfacts.org' || candidate.hostname.endsWith('.openfoodfacts.org'))) return null;
    return {
      imageUrl: candidate.toString(),
      productName: product.product_name || '',
      brands: product.brands || '',
      source: 'open-food-facts'
    };
  } catch {
    return null;
  }
}

export async function lookupOpenFoodFactsImage(barcode: string, expectedName = '', store = ''): Promise<OpenFoodFactsImage | null> {
  const url = new URL(`https://world.openfoodfacts.org/api/v3.6/product/${encodeURIComponent(barcode)}.json`);
  url.searchParams.set('fields', 'code,product_name,brands,quantity,product_quantity,product_quantity_unit,selected_images,image_front_url,image_url');
  url.searchParams.set('lc', 'en');
  url.searchParams.set('cc', 'ph');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DIONIX-POS/2.1 (product image lookup)' },
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Product image source is unavailable.');

  const payload = await response.json() as { product?: OpenFoodFactsProduct };
  return payload.product ? safeImage(payload.product, barcode, expectedName, store) : null;
}

export async function searchOpenFoodFactsImage(name: string, store = ''): Promise<OpenFoodFactsImage | null> {
  const searchUrl = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  searchUrl.searchParams.set('search_terms', name.slice(0, 100));
  searchUrl.searchParams.set('search_simple', '1');
  searchUrl.searchParams.set('action', 'process');
  searchUrl.searchParams.set('json', '1');
  searchUrl.searchParams.set('page_size', '8');
  searchUrl.searchParams.set('fields', 'code,product_name,brands,quantity,product_quantity,product_quantity_unit,image_front_url,image_url');
  const response = await fetch(searchUrl, {
    headers: { 'User-Agent': 'DIONIX-POS/2.1 (product image lookup)' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Product image source is unavailable.');
  const payload = await response.json() as { products?: OpenFoodFactsProduct[] };
  const storeTokens = new Set((store.toLocaleLowerCase().match(/[a-z0-9]+/g) || []).filter(token => token.length > 1));
  const wantedTokens = productTokens(name).filter(token => token.length > 1 && !storeTokens.has(token));
  if (wantedTokens.length < 2) return null;
  const requestedSize = name.toLocaleLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|cl|oz|lb)\b/)?.[0].replace(/\s+/g, '');

  for (const product of payload.products || []) {
    const candidateText = `${product.product_name || ''} ${product.brands || ''} ${product.quantity || ''} ${product.product_quantity || ''}${product.product_quantity_unit || ''}`.toLocaleLowerCase();
    const resultTokens = new Set(productTokens(candidateText));
    const matched = wantedTokens.filter(token => resultTokens.has(token)).length;
    if (matched / wantedTokens.length < 0.8 || matched < 2) continue;
    if (requestedSize) {
      const candidateSize = candidateText.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|cl|oz|lb)\b/)?.[0].replace(/\s+/g, '');
      if (candidateSize !== requestedSize) continue;
    }
    const suggestion = safeImage(product);
    if (suggestion) return suggestion;
  }
  return null;
}
