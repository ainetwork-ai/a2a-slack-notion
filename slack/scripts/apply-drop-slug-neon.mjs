import { config } from "dotenv";
config({ path: ".env.local" });

process.argv[2] = process.env.POSTGRES_URL;
await import("./apply-drop-slug.mjs");
