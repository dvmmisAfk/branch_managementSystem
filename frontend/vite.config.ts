import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const viteDebug = process.env.VITE_DEBUG === "true";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
  /** Pre-deploy: `VITE_DEBUG=true npm run build` for browser-readable source maps. */
  build: {
    sourcemap: viteDebug,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "recharts";
          if (id.includes("node_modules/antd")) return "antd";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
