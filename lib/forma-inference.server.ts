import 'server-only';

import { createFormaInferenceProvider } from './forma-inference';
import { HuggingFaceInferenceProvider } from './huggingface-inference.server';
import { NvidiaBuildInferenceProvider } from './nvidia-build-inference.server';

const provider = process.env.FORMA_INFERENCE_PROVIDER || 'mock';
const allowMockFallback = provider === 'huggingface'
  ? process.env.HF_ALLOW_MOCK_FALLBACK !== 'false'
  : process.env.NVIDIA_BUILD_ALLOW_MOCK_FALLBACK !== 'false';

export const formaInferenceProvider = provider === 'nvidia-build'
  ? new NvidiaBuildInferenceProvider({
      baseUrl: process.env.NVIDIA_BUILD_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      reasoningModel: process.env.NVIDIA_REASONING_MODEL,
      generationModel: process.env.NVIDIA_GENERATION_MODEL,
      visionModel: process.env.NVIDIA_VISION_MODEL,
      parseModel: process.env.NVIDIA_PARSE_MODEL,
      keyPresent: Boolean(process.env.NVIDIA_API_KEY),
      allowMockFallback,
    })
  : provider === 'huggingface'
    ? new HuggingFaceInferenceProvider({
        baseUrl: process.env.HF_INFERENCE_BASE_URL || 'https://router.huggingface.co/v1',
        token: process.env.HF_TOKEN,
        reasoningModel: process.env.HF_REASONING_MODEL || 'openai/gpt-oss-120b:fastest',
        visionModel: process.env.HF_VISION_MODEL || 'Qwen/Qwen2.5-VL-3B-Instruct:fastest',
        allowMockFallback,
      })
  : createFormaInferenceProvider({
      reasoningUrl: provider === 'local' ? process.env.FORMA_REASONING_URL : undefined,
      visionUrl: provider === 'local' ? process.env.FORMA_VISION_URL : undefined,
      parseUrl: provider === 'local' ? process.env.FORMA_PARSE_URL : undefined,
      allowMockFallback,
    });
