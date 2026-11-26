export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { release: process.env.NUMORA_WEB_RELEASE ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
