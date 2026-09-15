import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

export default defineConfig({
  // The PWA has no runtime version API like Tauri's `getVersion()`, so its
  // version is baked in at build time. Keep `package.json`'s version in step
  // with `agent/src-tauri/Cargo.toml` — they ship together as one release.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png"],
      // This inline manifest is the only one that ships: VitePWA writes
      // dist/manifest.webmanifest over anything Vite copies out of public/,
      // so there is deliberately no public/manifest.webmanifest to drift.
      manifest: {
        name: "FreeRemoteDesk",
        short_name: "FreeRemote",
        lang: "zh-CN",
        description: "从任何设备连上你的家用开发机。",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
