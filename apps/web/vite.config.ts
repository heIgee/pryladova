import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/telemetry": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
