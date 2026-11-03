import { lookupOpenFoodFactsImage, searchOpenFoodFactsImage } from '../src/services/openFoodFactsLookup.js';

interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawBarcode = req.query.barcode;
  const barcode = Array.isArray(rawBarcode) ? rawBarcode[0] : rawBarcode;
  const rawName = req.query.name;
  const name = Array.isArray(rawName) ? rawName[0] : rawName;
  const rawStore = req.query.store;
  const store = Array.isArray(rawStore) ? rawStore[0] : rawStore;
  const hasBarcode = Boolean(barcode && /^\d{8,14}$/.test(barcode));
  const cleanName = name?.trim().slice(0, 100);
  if (!hasBarcode && (!cleanName || cleanName.length < 4)) return res.status(400).json({ error: 'Enter a product name or a valid barcode.' });

  try {
    const suggestion = hasBarcode
      ? await lookupOpenFoodFactsImage(barcode!, cleanName || '', store || '')
      : await searchOpenFoodFactsImage(cleanName!, store || '');
    return res.status(200).json({ suggestion });
  } catch {
    return res.status(502).json({ error: 'Product image lookup failed.' });
  }
}

