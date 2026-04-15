import * as jose from 'jose';

const SECRET = () => {
  const secret = process.env['AUTH_SECRET'];
  if (!secret && process.env['NODE_ENV'] === 'production') {
    throw new Error('AUTH_SECRET must be set in production');
  }
  return new TextEncoder().encode(secret ?? 'dev-secret-change-me');
};
const ALG = 'HS256';
const EXPIRY = '7d';

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signToken(payload: { sub: string; walletAddress: string }): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET());
}

export async function verifyToken(token: string): Promise<{ sub: string; walletAddress: string }> {
  const { payload } = await jose.jwtVerify(token, SECRET());
  return { sub: payload.sub as string, walletAddress: payload['walletAddress'] as string };
}
