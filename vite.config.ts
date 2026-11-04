import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import createHtmlPlugin from "vite-plugin-simple-html";

// Shown at the bottom of the More sheet, so it is easy to tell which build a device is running. The
// same text is published as version.json, which an open app polls to notice that a newer build exists.
const APP_VERSION = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7)} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      open: process.env.NODE_ENV !== "CI",
      filename: "./dist/stats.html",
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          mainScript: `src/main.tsx`,
        },
      },
    }),
    {
      name: "publish-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ version: APP_VERSION }),
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // A new build takes over at once. Without this, an open tab keeps the old screens
        // until every tab is closed.
        importScripts: ["push-sw.js"],
        skipWaiting: true,
        clientsClaim: true,
        // The service worker is kept for notifications, not for offline use. It used to download
        // every screen of the app (about 150 files) before an update could take over; on a phone
        // that can fail quietly and leave the old version in place. Now only the icons are cached,
        // and the page itself always comes from the network, so a new build is shown at once.
        globPatterns: ["appIcon/*.png", "favicon.ico", "logos/*.svg"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
      manifest: false, // Use existing manifest.json from public/
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    ...(process.env.NODE_ENV === "production" && process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_IS_DEMO": JSON.stringify(
            process.env.VITE_IS_DEMO,
          ),
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
            process.env.VITE_SUPABASE_URL,
          ),
          "import.meta.env.VITE_SB_PUBLISHABLE_KEY": JSON.stringify(
            process.env.VITE_SB_PUBLISHABLE_KEY,
          ),
          "import.meta.env.VITE_INBOUND_EMAIL": JSON.stringify(
            process.env.VITE_INBOUND_EMAIL,
          ),
          "import.meta.env.VITE_ATTACHMENTS_BUCKET": JSON.stringify(
            process.env.VITE_ATTACHMENTS_BUCKET,
          ),
        }
      : {}),
  },
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["react-router", "react-router-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
