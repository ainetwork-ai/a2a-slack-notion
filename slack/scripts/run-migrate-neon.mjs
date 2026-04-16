import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL missing from .env.local");
  process.exit(1);
}

process.env.POSTGRES_URL = url;
await import("./migrate-workflows-natural-keys.mjs");
