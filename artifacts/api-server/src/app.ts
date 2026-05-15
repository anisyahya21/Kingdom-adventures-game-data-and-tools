import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
// In production, Replit routes /ka-api/* directly to this server.
// This alias ensures those requests are handled correctly.
app.use("/ka-api", router);

// Serve website icons (equipment/item PNGs extracted from the APK).
// In dev the Vite proxy forwards /website_icons/ here; in production
// the server serves them directly.
const websiteIconsDir = path.resolve(__dirname, "../../../website_icons");
app.use("/website_icons", express.static(websiteIconsDir, { maxAge: "7d", immutable: false }));

export default app;
