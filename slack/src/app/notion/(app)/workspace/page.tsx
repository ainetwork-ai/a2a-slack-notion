import { redirect } from 'next/navigation';

// Workspace index — public app, no onboarding/login. Bounce back to /notion landing,
// which auto-routes to the first workspace (or stays put if none exists).
export default function WorkspacePage() {
  redirect('/notion');
}
