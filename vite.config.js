import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development, Vite serves the frontend. When deployed to Vercel,
// the /api folder is served automatically as serverless functions, so no proxy
// config is needed in production. For local dev of the API, use `vercel dev`
// (see SETUP.md), which serves both the frontend and /api together.
export default defineConfig({
  plugins: [react()]
});
