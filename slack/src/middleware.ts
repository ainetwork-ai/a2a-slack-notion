import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/v1/')) {
    response.headers.set('Notion-Version', '2026-04-15');
  }
  return response;
}

export const config = {
  matcher: '/api/v1/:path*',
};
