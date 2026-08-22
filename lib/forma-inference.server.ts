import 'server-only';

import { createFormaInferenceProvider } from './forma-inference';

export const formaInferenceProvider = createFormaInferenceProvider({
  reasoningUrl: process.env.FORMA_REASONING_URL,
  visionUrl: process.env.FORMA_VISION_URL,
  parseUrl: process.env.FORMA_PARSE_URL,
  allowMockFallback: true,
});
