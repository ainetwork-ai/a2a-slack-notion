import { redirect } from 'next/navigation';

// Workspace index — redirects to first workspace or onboarding
export default function WorkspacePage() {
  // TODO: Fetch user's workspaces and redirect to first one
  // For now, redirect to onboarding
  redirect('/onboarding');
}
