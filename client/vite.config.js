import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 is Vite's default and collides with other projects on this machine
    // (a cached service worker on that origin can serve the wrong app).
    allowedHosts: [".ngrok-free.app"],
    port: 5273,
    strictPort: true,
    // Everything under /api goes to the Express + MongoDB backend.
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
