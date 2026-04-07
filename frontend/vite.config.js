import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/projects": "http://backend:8000",
      "/annotations": "http://backend:8000",
      "/jobs": "http://backend:8000",
      "/storage": "http://backend:8000",
      "/health": "http://backend:8000",
    },
  },
});
