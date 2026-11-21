import { createServer } from "./index";

// Entry for the Vercel serverless function. `pnpm build:vercel` bundles this file
// (and everything under server/) into api/index.js, because Vercel runs files in
// api/ as plain Node ESM and cannot resolve the extensionless imports used in server/.
export default createServer();
