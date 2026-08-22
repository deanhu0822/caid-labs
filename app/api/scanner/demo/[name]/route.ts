import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_ASSETS: Record<string, { file: string; contentType: string }> = {
  j12: { file: 'j12-connector-closeup.png', contentType: 'image/png' },
  rover: { file: 'rover-j12-wide.png', contentType: 'image/png' },
  motor: { file: 'motor-assembly.svg', contentType: 'image/svg+xml' },
  battery: { file: 'battery-assembly.svg', contentType: 'image/svg+xml' },
};

export async function GET(_request: Request, context: RouteContext<'/api/scanner/demo/[name]'>) {
  const { name } = await context.params;
  const asset = DEMO_ASSETS[name];
  if (!asset) return Response.json({ error: 'Unknown scanner demo asset.' }, { status: 404 });
  const file = await fs.readFile(path.join(process.cwd(), 'synthetic-assets', 'rover-alpha', 'scanner', asset.file));
  return new Response(file, {
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'public, max-age=3600',
      'X-Forma-Scanner-Mode': 'synthetic-demo-asset',
    },
  });
}
