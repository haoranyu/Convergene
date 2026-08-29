import {
  modeReadinessDimensionKeys,
  sharedReadinessDimensionKeys,
  type MeetingBriefSnapshot,
  type MeetingMode,
  type ReadinessDimension,
} from '@/modules/meeting-domain';
import type { GrillOutput, InitialMapOutput } from '@/features/preparation/ai-contract';

export const primaryPreparationModes = ['DECISION', 'BRAINSTORM', 'RETRO'] as const;

export function readinessDimensions(mode: MeetingMode): ReadinessDimension[] {
  return [...sharedReadinessDimensionKeys, ...modeReadinessDimensionKeys[mode]].map((key) => ({
    key,
    status: key === 'objective' ? 'READY' : 'MISSING',
  }));
}

function brief(mode: MeetingMode, objective: string, desiredOutcome: string): MeetingBriefSnapshot {
  return {
    assumptions: ['The required participants can attend'],
    confirmed: [objective],
    confirmedAt: '2026-08-29T09:30:00.000Z',
    desiredOutcome,
    facilitation: {
      closingChecklist: ['Confirm what happens next'],
      openingLine: `We are here to ${objective.toLocaleLowerCase()}.`,
    },
    objective,
    readiness: { dimensions: readinessDimensions(mode), level: 'BARELY_READY' },
    unknowns: ['Final constraints'],
  };
}

export const preparationBriefFixtures = {
  BRAINSTORM: brief('BRAINSTORM', 'Generate launch ideas', 'Select three concepts to test'),
  DECISION: brief('DECISION', 'Choose a launch plan', 'Name one selected plan and owner'),
  RETRO: brief('RETRO', 'Learn from the delayed launch', 'Agree on two improvements'),
} as const satisfies Record<(typeof primaryPreparationModes)[number], MeetingBriefSnapshot>;

function grillOutput(mode: MeetingMode, question: string): GrillOutput {
  return {
    ...(mode === 'DECISION'
      ? {
          options: [
            { label: 'One named decision maker', value: 'named_decision_maker' },
            { label: 'The group decides by consensus', value: 'group_consensus' },
            { label: 'No decision owner yet', value: 'not_decided' },
          ],
          questionType: 'SINGLE_CHOICE' as const,
        }
      : { questionType: 'FREE_TEXT' as const }),
    question,
    readiness: { dimensions: readinessDimensions(mode), level: 'INSUFFICIENT' },
    reason: 'This missing detail determines whether the meeting can produce a useful result.',
    shouldAsk: true,
    updatedState: { assumptions: [], confirmed: [], unknowns: [] },
  };
}

export const grillOutputFixtures = {
  BRAINSTORM: grillOutput('BRAINSTORM', 'Whose problem are we solving?'),
  DECISION: grillOutput('DECISION', 'Who owns the final decision?'),
  RETRO: grillOutput('RETRO', 'Which part of the launch are we reviewing?'),
} as const satisfies Record<(typeof primaryPreparationModes)[number], GrillOutput>;

export const initialMapOutputFixtures = {
  BRAINSTORM: {
    nodes: [
      { key: 'root', kind: 'OBJECTIVE', title: 'Generate launch ideas' },
      {
        key: 'audience',
        kind: 'TOPIC',
        order: 0,
        parentKey: 'root',
        title: 'Audience tensions',
        topicPrompt: 'What does the audience struggle with today?',
        transitionHint: 'Turn those tensions into creative directions.',
      },
      {
        key: 'directions',
        kind: 'TOPIC',
        order: 1,
        parentKey: 'root',
        title: 'Creative directions',
        topicPrompt: 'What distinct approaches could solve the challenge?',
        transitionHint: 'Compare the strongest directions.',
      },
      {
        key: 'selection',
        kind: 'TOPIC',
        order: 2,
        parentKey: 'root',
        title: 'Selection',
        topicPrompt: 'Which ideas deserve a test?',
        transitionHint: 'Close with the concepts to test.',
      },
      { key: 'lens', kind: 'IDEA', parentKey: 'audience', title: 'Change the audience lens' },
      { key: 'wild', kind: 'IDEA', parentKey: 'directions', title: 'Remove one constraint' },
      { key: 'test', kind: 'ACTION', parentKey: 'selection', title: 'Name the first test' },
    ],
    templateCoverage: ['challenge', 'divergence', 'selection'],
  },
  DECISION: {
    nodes: [
      { key: 'root', kind: 'OBJECTIVE', title: 'Choose a launch plan' },
      {
        key: 'options',
        kind: 'TOPIC',
        order: 0,
        parentKey: 'root',
        title: 'Viable options',
        topicPrompt: 'Which options are genuinely available?',
        transitionHint: 'Compare them against explicit criteria.',
      },
      {
        key: 'criteria',
        kind: 'TOPIC',
        order: 1,
        parentKey: 'root',
        title: 'Decision criteria',
        topicPrompt: 'What trade-offs matter most?',
        transitionHint: 'Surface the risks before deciding.',
      },
      {
        key: 'choice',
        kind: 'TOPIC',
        order: 2,
        parentKey: 'root',
        title: 'Choice and owner',
        topicPrompt: 'What can the decision owner commit to?',
        transitionHint: 'Close with one choice and next step.',
      },
      { key: 'regional', kind: 'OPTION', parentKey: 'options', title: 'Regional launch' },
      { key: 'risk', kind: 'RISK', parentKey: 'criteria', title: 'Capacity risk' },
      { key: 'owner', kind: 'ACTION', parentKey: 'choice', title: 'Confirm decision owner' },
    ],
    templateCoverage: ['options', 'criteria', 'decision'],
  },
  RETRO: {
    nodes: [
      { key: 'root', kind: 'OBJECTIVE', title: 'Learn from launch delay' },
      {
        key: 'facts',
        kind: 'TOPIC',
        order: 0,
        parentKey: 'root',
        title: 'Shared facts',
        topicPrompt: 'What happened, without interpretation?',
        transitionHint: 'Compare facts with what was expected.',
      },
      {
        key: 'causes',
        kind: 'TOPIC',
        order: 1,
        parentKey: 'root',
        title: 'Causes and patterns',
        topicPrompt: 'Which conditions produced this result?',
        transitionHint: 'Turn the strongest learning into change.',
      },
      {
        key: 'improvements',
        kind: 'TOPIC',
        order: 2,
        parentKey: 'root',
        title: 'Improvements',
        topicPrompt: 'What should we change next time?',
        transitionHint: 'Close with concrete experiments.',
      },
      { key: 'timeline', kind: 'NOTE', parentKey: 'facts', title: 'Timeline evidence' },
      { key: 'handoff', kind: 'INSIGHT', parentKey: 'causes', title: 'Handoff pattern' },
      { key: 'experiment', kind: 'ACTION', parentKey: 'improvements', title: 'Run one experiment' },
    ],
    templateCoverage: ['facts', 'causes', 'improvements'],
  },
} as const satisfies Record<(typeof primaryPreparationModes)[number], InitialMapOutput>;
