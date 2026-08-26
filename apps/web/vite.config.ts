import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        // changeOrigin would rewrite the Host header the API sees to the
        // proxy target (localhost:3000), while the browser's real Origin
        // header (localhost:5173) passes through unchanged — the API's
        // Origin-vs-Host CSRF check (apps/api/src/plugins/auth.ts) would
        // then see a mismatch on every request in dev. Production has no
        // such proxy: API and web share one origin there regardless.
        changeOrigin: false,
      },
    },
  },
});
