import 'server-only';

import { createFormaInferenceProvider } from './forma-inference';
import { NvidiaBuildInferenceProvider } from './nvidia-build-inference.server';

const allowMockFallback = process.env.NVIDIA_BUILD_ALLOW_MOCK_FALLBACK !== 'false';
const provider = process.env.FORMA_INFERENCE_PROVIDER || 'mock';

export const formaInferenceProvider = provider === 'nvidia-build'
  ? new NvidiaBuildInferenceProvider({
      baseUrl: process.env.NVIDIA_BUILD_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      reasoningModel: process.env.NVIDIA_REASONING_MODEL,
      visionModel: process.env.NVIDIA_VISION_MODEL,
      parseModel: process.env.NVIDIA_PARSE_MODEL,
      keyPresent: Boolean(process.env.NVIDIA_API_KEY),
      allowMockFallback,
    })
  : createFormaInferenceProvider({
      reasoningUrl: provider === 'local' ? process.env.FORMA_REASONING_URL : undefined,
      visionUrl: provider === 'local' ? process.env.FORMA_VISION_URL : undefined,
      parseUrl: provider === 'local' ? process.env.FORMA_PARSE_URL : undefined,
      allowMockFallback,
    });
