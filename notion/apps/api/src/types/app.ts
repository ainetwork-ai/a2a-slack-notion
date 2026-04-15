import type { AuthenticatedUser } from './auth.js';

export type AppVariables = {
  traceId: string;
  user: AuthenticatedUser | null;
};
