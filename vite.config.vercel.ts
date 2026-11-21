import { defineConfig } from "vite";
import path from "node:path";

// Bundles the Express app into a single file, api/index.js, for Vercel.
// npm dependencies stay external; Vercel traces them into the function.
export default defineConfig({
  publicDir: false, // do not copy public/ into api/
  build: {
    ssr: path.resolve(__dirname, "server/vercel.ts"),
    outDir: "api",
    emptyOutDir: false, // api/ holds only the generated bundle; never wipe it
    target: "node22",
    minify: false,
    rollupOptions: {
      output: { format: "es", entryFileNames: "index.js" },
    },
  },
  ssr: { target: "node" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
