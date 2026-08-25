import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildApp } from "./app.js";

const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const isProduction = process.env.NODE_ENV === "production";
const webDistPath = fileURLToPath(new URL("../../web/dist", import.meta.url));

const app = buildApp({
  databasePath: path.join(dataDir, "studia.db"),
  webDistPath: isProduction ? webDistPath : undefined,
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
