export type AuthenticatedUser = {
  id: string;
  walletAddress: string;
  name: string;
  image: string | null;
  createdAt: Date;
};
