import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Cloudflare Workers serves the assets at the domain root, so no subpath.
  // `import.meta.env.BASE_URL` follows this, which is what LOGO_SRC, the grain
  // overlay, and the picture fallbacks in pictures.js derive their URLs from.
  base: '/',
  plugins: [react()],
});
