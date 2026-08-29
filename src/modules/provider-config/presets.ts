import type { ProviderId, ProviderModelMapping } from './model';

interface ProviderPreset {
  baseURL: string;
  models: ProviderModelMapping;
  name: string;
}

export const providerPresets = {
  SILICONFLOW: {
    baseURL: 'https://api.siliconflow.cn/v1',
    models: {
      fast: 'deepseek-ai/DeepSeek-V4-Flash',
      grill: 'deepseek-ai/DeepSeek-V4-Flash',
      report: 'deepseek-ai/DeepSeek-V4-Flash',
    },
    name: 'siliconflow',
  },
  STEPFUN: {
    baseURL: 'https://api.stepfun.com/step_plan/v1',
    models: {
      fast: 'step-3.7-flash',
      grill: 'step-3.7-flash',
      report: 'step-3.7-flash',
    },
    name: 'stepfun',
  },
} as const satisfies Record<ProviderId, ProviderPreset>;
