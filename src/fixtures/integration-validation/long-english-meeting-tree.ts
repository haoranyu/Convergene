import type {
  IntegrationLayoutEdge,
  IntegrationLayoutNode,
} from '@/modules/integration-validation/canvas';

const standardNodeSize = { height: 80, width: 288 } as const;

export const longEnglishMeetingTreeNodes: IntegrationLayoutNode[] = [
  {
    ...standardNodeSize,
    id: 'objective',
    title: 'Choose the most reliable launch approach today',
  },
  {
    ...standardNodeSize,
    id: 'topic-audience',
    title: 'Clarify the first customer group we must serve',
  },
  {
    ...standardNodeSize,
    id: 'topic-criteria',
    title: 'Agree on measurable launch decision criteria',
  },
  {
    ...standardNodeSize,
    id: 'topic-options',
    title: 'Compare feasible launch paths and constraints',
  },
  {
    ...standardNodeSize,
    id: 'topic-risks',
    title: 'Surface risks that could invalidate the choice',
  },
  {
    ...standardNodeSize,
    id: 'audience-primary',
    title: 'Prioritize new facilitators in small meetings',
  },
  {
    ...standardNodeSize,
    id: 'audience-secondary',
    title: 'Keep experienced facilitators as later adopters',
  },
  {
    ...standardNodeSize,
    id: 'criteria-speed',
    title: 'Complete guided preparation within five minutes',
  },
  {
    ...standardNodeSize,
    id: 'criteria-safety',
    title: 'Preserve meeting data after every failure',
  },
  {
    ...standardNodeSize,
    id: 'option-guided',
    title: 'Launch with guided workflow and fixed templates',
  },
  {
    ...standardNodeSize,
    id: 'option-flexible',
    title: 'Launch with flexible prompts and manual controls',
  },
  {
    ...standardNodeSize,
    id: 'risk-provider',
    title: 'Provider schema behavior may differ unexpectedly',
  },
];

export const longEnglishMeetingTreeEdges: IntegrationLayoutEdge[] = [
  { id: 'edge-objective-audience', order: 0, source: 'objective', target: 'topic-audience' },
  { id: 'edge-objective-criteria', order: 1, source: 'objective', target: 'topic-criteria' },
  { id: 'edge-objective-options', order: 2, source: 'objective', target: 'topic-options' },
  { id: 'edge-objective-risks', order: 3, source: 'objective', target: 'topic-risks' },
  { id: 'edge-audience-primary', order: 0, source: 'topic-audience', target: 'audience-primary' },
  {
    id: 'edge-audience-secondary',
    order: 1,
    source: 'topic-audience',
    target: 'audience-secondary',
  },
  { id: 'edge-criteria-speed', order: 0, source: 'topic-criteria', target: 'criteria-speed' },
  { id: 'edge-criteria-safety', order: 1, source: 'topic-criteria', target: 'criteria-safety' },
  { id: 'edge-options-guided', order: 0, source: 'topic-options', target: 'option-guided' },
  { id: 'edge-options-flexible', order: 1, source: 'topic-options', target: 'option-flexible' },
  { id: 'edge-risks-provider', order: 0, source: 'topic-risks', target: 'risk-provider' },
];
