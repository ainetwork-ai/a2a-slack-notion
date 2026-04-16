import { sealData } from "iron-session";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const [user] =
  await sql`SELECT id, ain_address, display_name FROM users WHERE is_agent = false ORDER BY created_at LIMIT 1`;

if (!user) {
  console.error("No human user found");
  process.exit(1);
}

const password = process.env.SESSION_SECRET || "dev-secret-change-in-production-32ch";
const sealed = await sealData(
  { userId: user.id, ainAddress: user.ain_address },
  { password, ttl: 60 * 60 * 24 * 7 }
);

console.log(JSON.stringify({ user, cookie: `slack-a2a-session=${sealed}` }, null, 2));
