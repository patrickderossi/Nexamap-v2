// Vercel serverless entry for the whole Express API.
//
// Vercel maps every `/api/*` request to this single catch-all function. The
// Express app from server/index.ts is itself a valid (req, res) handler, so we
// just export it as the default — the Netlify build uses the same createServer()
// via serverless-http. Routes are registered with their full `/api/...` paths,
// which is exactly what req.url carries here, so they match directly.
import { createServer } from "../server/index";

export default createServer();
