import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { lookupOpenFoodFactsImage, searchOpenFoodFactsImage } from './src/services/openFoodFactsLookup.js'

const productImageApi = (): Plugin => ({
  name: 'dionix-product-image-api',
  configureServer(server) {
    server.middlewares.use('/api/product-image', async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const requestUrl = new URL(req.url || '/', 'http://localhost');
      const barcode = requestUrl.searchParams.get('barcode') || '';
      const name = (requestUrl.searchParams.get('name') || '').trim().slice(0, 100);
      const store = (requestUrl.searchParams.get('store') || '').trim().slice(0, 80);
      const hasBarcode = /^\d{8,14}$/.test(barcode);
      if (!hasBarcode && name.length < 4) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Enter a product name or a valid barcode.' }));
        return;
      }

      try {
        const suggestion = hasBarcode
          ? await lookupOpenFoodFactsImage(barcode, name, store)
          : await searchOpenFoodFactsImage(name, store);
        res.statusCode = 200;
        res.end(JSON.stringify({ suggestion }));
      } catch {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: 'Product image lookup failed.' }));
      }
    });
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    productImageApi(),
    react(),
  ],
  resolve: {
    alias: {
      html2canvas: 'html2canvas-pro',
    },
  },
})

