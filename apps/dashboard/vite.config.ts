/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite + Vitest config. The `test` block is typed via vitest/config.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolve the workspace types package to its TS source so its runtime enums
      // bundle as proper ESM named exports (the published dist is CommonJS, whose
      // TS-enum pattern Rollup's named-export detection cannot statically read).
      // tsc still type-checks against the package's dist/index.d.ts.
      '@hospital-ai/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow importing the aliased shared-types source from the monorepo root.
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
    // Convenience proxy: if VITE_API_BASE_URL is left as "/v1", requests are
    // forwarded to the local API. The default .env.example uses an absolute URL,
    // so this proxy is only a fallback.
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
