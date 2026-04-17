import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for the MV3 extension.
 *
 * MV3 constraints mean every entry point is a separate bundle:
 *   - background.js   — service worker (ES module)
 *   - popup.js        — popup UI
 *   - options.js      — options page
 *   - content.js      — content script (runs in page context)
 *
 * All four are emitted at the root of `dist/` so that the static
 * `manifest.json`, `popup.html`, and `options.html` can reference
 * them without any path rewriting. Copy the static files into dist
 * after build (handled below via writeBundle hook).
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup.tsx'),
        options: resolve(__dirname, 'src/options.tsx'),
        content: resolve(__dirname, 'src/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es',
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-statics',
      apply: 'build',
      async writeBundle() {
        const { copyFile, mkdir } = await import('node:fs/promises');
        const statics = [
          'manifest.json',
          'popup.html',
          'options.html',
          'icon16.png',
          'icon48.png',
        ];
        await mkdir(resolve(__dirname, 'dist'), { recursive: true });
        await Promise.all(
          statics.map(async (file) => {
            try {
              await copyFile(
                resolve(__dirname, file),
                resolve(__dirname, 'dist', file),
              );
            } catch {
              // static file may not exist yet (icons) — ignore
            }
          }),
        );
      },
    },
  ],
});
