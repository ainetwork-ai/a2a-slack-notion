// @ts-expect-error TODO: add meilisearch to package.json — `pnpm add meilisearch`
import { MeiliSearch } from "meilisearch";

const host = process.env.MEILI_HOST ?? "http://localhost:7700";
const apiKey = process.env.MEILI_MASTER_KEY;

export const meili = new MeiliSearch({ host, apiKey });
