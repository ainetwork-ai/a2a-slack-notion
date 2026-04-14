import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  ainAddress?: string;
  challenge?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "dev-secret-change-in-production-32ch",
  cookieName: "slack-a2a-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
