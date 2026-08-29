import { providerModelPresets, type ProviderId, type ProviderModelMapping } from './model';

interface ProviderPreset {
  baseURL: string;
  models: ProviderModelMapping;
  name: string;
}

export const providerPresets = {
  SILICONFLOW: {
    baseURL: 'https://api.siliconflow.cn/v1',
    models: providerModelPresets.SILICONFLOW,
    name: 'siliconflow',
  },
  STEPFUN: {
    baseURL: 'https://api.stepfun.com/step_plan/v1',
    models: providerModelPresets.STEPFUN,
    name: 'stepfun',
  },
} as const satisfies Record<ProviderId, ProviderPreset>;
