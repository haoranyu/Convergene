import type { ClassifyMeetingInput, ClassifyMeetingOutput } from '@/modules/meeting-ai';
import type { SupportedLocale } from '@/modules/meeting-domain';
import { providerIds, providerModelPresets, type ProviderId } from '@/modules/provider-config';

export interface ClassifyMeetingProviderFixture {
  input: ClassifyMeetingInput;
  locale: SupportedLocale;
  model: string;
  output: ClassifyMeetingOutput;
  provider: ProviderId;
}

const localeFixtures = [
  {
    input: { rawRequest: '在九月发布前选定一个上线方案。' },
    locale: 'zh-CN',
    output: {
      confidence: 'HIGH',
      reason: '这场会议需要在备选方案中做出明确决定。',
      recommendedMode: 'DECISION',
      suggestedTitle: '选定九月上线方案',
    },
  },
  {
    input: { rawRequest: '為新產品發想一組值得測試的上市角度。' },
    locale: 'zh-TW',
    output: {
      confidence: 'HIGH',
      reason: '這場會議需要廣泛產生可測試的創意方向。',
      recommendedMode: 'BRAINSTORM',
      suggestedTitle: '發想產品上市角度',
    },
  },
  {
    input: { rawRequest: 'Learn why the last two releases repeated the same incident.' },
    locale: 'en-US',
    output: {
      confidence: 'HIGH',
      reason: 'The team needs to learn from a repeated release failure.',
      recommendedMode: 'RETRO',
      suggestedTitle: 'Review repeated release incidents',
    },
  },
] as const satisfies ReadonlyArray<{
  input: ClassifyMeetingInput;
  locale: SupportedLocale;
  output: ClassifyMeetingOutput;
}>;

export const classifyMeetingProviderFixtures: readonly ClassifyMeetingProviderFixture[] =
  providerIds.flatMap((provider) =>
    localeFixtures.map((fixture) => ({
      ...fixture,
      model: providerModelPresets[provider].fast,
      provider,
    })),
  );
