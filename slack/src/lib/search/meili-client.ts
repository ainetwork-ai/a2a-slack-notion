import { Meilisearch } from "meilisearch";

const host = process.env.MEILI_HOST ?? "http://localhost:7700";
const apiKey = process.env.MEILI_MASTER_KEY;

export const meili = new Meilisearch({ host, apiKey });
