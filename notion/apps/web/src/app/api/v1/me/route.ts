import { NextResponse } from 'next/server';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET() {
  const user = await getDefaultUser();
  return NextResponse.json(user);
}
