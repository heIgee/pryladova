import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/telemetry": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/settings": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
