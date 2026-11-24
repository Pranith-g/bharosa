import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `npm run dev` serves the app on :5173 and forwards API + MCP calls to the FastAPI server on :8000.
// `npm run build` writes into bharosa/web/dist, which FastAPI serves in production.
const backend = "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../bharosa/web/dist", emptyOutDir: true },
  server: {
    proxy: Object.fromEntries(
      ["/api", "/mcp", "/guardian-mcp", "/health", "/webhooks", "/classic"].map((p) => [p, backend]),
    ),
  },
});
