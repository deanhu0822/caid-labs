import {
  generateWithNemoClawBackend,
  NemoClawConfigurationError,
  NemoClawUnavailableError,
} from '@/lib/nemoclaw-adapter.server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    return await generateWithNemoClawBackend(request);
  } catch (error) {
    if (error instanceof NemoClawConfigurationError) {
      return new Response(error.message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (error instanceof NemoClawUnavailableError) {
      return new Response(error.message, { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response('NemoClaw generation proxy failed.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
