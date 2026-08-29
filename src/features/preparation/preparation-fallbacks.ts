import {
  modeReadinessDimensionKeys,
  sharedReadinessDimensionKeys,
  type MeetingBriefSnapshot,
  type MeetingMode,
  type ReadinessDimension,
  type SupportedLocale,
} from '@/modules/meeting-domain';
import { graphemeCount, maximumNodeTitleGraphemes } from '@/modules/mind-map-domain';

import {
  parseGrillOutput,
  parseProviderInitialMapOutput,
  type GrillInput,
  type GrillOutput,
  type InitialMapInput,
  type InitialMapOutput,
  type ProviderInitialMapOutput,
} from './ai-contract';

export const grillOutputBranches = ['ASK', 'COMPLETE'] as const;
export type GrillOutputBranch = (typeof grillOutputBranches)[number];

interface GrillCopy {
  checklist: [string, string];
  criticalReason: string;
  desiredOutcome: Record<MeetingMode, string>;
  openingLine: string;
  question: Record<MeetingMode, string>;
  reason: string;
  unknown: string;
}

const grillCopy: Record<SupportedLocale, GrillCopy> = {
  'en-US': {
    checklist: ['Confirm the result', 'Name the next step'],
    criticalReason: 'This final gap could prevent the meeting from reaching a usable result.',
    desiredOutcome: {
      BRAINSTORM: 'Select ideas that are ready for a concrete test.',
      DECISION: 'Reach a clear decision and name the next step.',
      GENERAL: 'Leave with a shared result and a clear next step.',
      RETRO: 'Agree on practical improvements to try next.',
    },
    openingLine: 'We will clarify the goal, work through the key topics, and close with a result.',
    question: {
      BRAINSTORM: 'What challenge should the ideas address?',
      DECISION: 'What decision must this meeting make?',
      GENERAL: 'What must this meeting accomplish?',
      RETRO: 'What event or period should this retrospective examine?',
    },
    reason: 'This detail is needed to keep the meeting focused on a usable result.',
    unknown: 'Details that have not yet been confirmed',
  },
  'zh-CN': {
    checklist: ['确认会议结果', '明确下一步行动'],
    criticalReason: '这个最后的缺口可能导致会议无法产出可用结果。',
    desiredOutcome: {
      BRAINSTORM: '选出可以进入具体测试的想法。',
      DECISION: '形成明确决策并确定下一步行动。',
      GENERAL: '形成共同结果并明确下一步行动。',
      RETRO: '确定下一次要尝试的具体改进。',
    },
    openingLine: '我们先澄清目标，再讨论关键主题，最后确认结果。',
    question: {
      BRAINSTORM: '这些想法需要解决什么挑战？',
      DECISION: '这次会议必须做出什么决策？',
      GENERAL: '这次会议必须达成什么目标？',
      RETRO: '这次复盘要聚焦哪个事件或阶段？',
    },
    reason: '这个信息能让会议聚焦并产出可用结果。',
    unknown: '尚未确认的细节',
  },
  'zh-TW': {
    checklist: ['確認會議結果', '明確下一步行動'],
    criticalReason: '這個最後缺口可能讓會議無法產出可用結果。',
    desiredOutcome: {
      BRAINSTORM: '選出可以進入具體測試的想法。',
      DECISION: '形成明確決策並確認下一步行動。',
      GENERAL: '形成共同結果並確認下一步行動。',
      RETRO: '確認下一次要嘗試的具體改進。',
    },
    openingLine: '我們先釐清目標，再討論關鍵主題，最後確認結果。',
    question: {
      BRAINSTORM: '這些想法需要解決什麼挑戰？',
      DECISION: '這次會議必須做出什麼決策？',
      GENERAL: '這次會議必須達成什麼目標？',
      RETRO: '這次回顧要聚焦哪個事件或階段？',
    },
    reason: '這項資訊能讓會議聚焦並產出可用結果。',
    unknown: '尚未確認的細節',
  },
};

interface TopicCopy {
  coverage: [string, string, string];
  topics: [
    { prompt: string; title: string; transition: string },
    { prompt: string; title: string; transition: string },
    { prompt: string; title: string; transition: string },
  ];
}

const mapCopy: Record<SupportedLocale, Record<MeetingMode, TopicCopy>> = {
  'en-US': {
    BRAINSTORM: {
      coverage: ['challenge', 'ideas', 'selection'],
      topics: [
        {
          prompt: 'What challenge are we solving?',
          title: 'Challenge',
          transition: 'Open up possible directions.',
        },
        {
          prompt: 'What distinct ideas could work?',
          title: 'Ideas',
          transition: 'Compare the strongest ideas.',
        },
        {
          prompt: 'Which ideas should we test?',
          title: 'Selection',
          transition: 'Close with the first test.',
        },
      ],
    },
    DECISION: {
      coverage: ['options', 'criteria', 'decision'],
      topics: [
        {
          prompt: 'Which options are genuinely available?',
          title: 'Options',
          transition: 'Compare them using clear criteria.',
        },
        {
          prompt: 'Which trade-offs matter most?',
          title: 'Criteria and risks',
          transition: 'Use them to make the decision.',
        },
        {
          prompt: 'What can the decision owner commit to?',
          title: 'Decision and next step',
          transition: 'Close with one accountable next step.',
        },
      ],
    },
    GENERAL: {
      coverage: ['context', 'discussion', 'next steps'],
      topics: [
        {
          prompt: 'What context must everyone share?',
          title: 'Shared context',
          transition: 'Move to the central discussion.',
        },
        {
          prompt: 'What must the group work through?',
          title: 'Key discussion',
          transition: 'Turn the discussion into a result.',
        },
        {
          prompt: 'What happens after this meeting?',
          title: 'Result and next steps',
          transition: 'Close with clear ownership.',
        },
      ],
    },
    RETRO: {
      coverage: ['facts', 'learning', 'improvements'],
      topics: [
        {
          prompt: 'What happened without interpretation?',
          title: 'Shared facts',
          transition: 'Look for patterns in the facts.',
        },
        {
          prompt: 'What helped or hindered the result?',
          title: 'Learning',
          transition: 'Turn the learning into change.',
        },
        {
          prompt: 'What should we try next time?',
          title: 'Improvements',
          transition: 'Close with concrete experiments.',
        },
      ],
    },
  },
  'zh-CN': {
    BRAINSTORM: {
      coverage: ['挑战', '想法', '筛选'],
      topics: [
        {
          prompt: '我们要解决什么挑战？',
          title: '明确挑战',
          transition: '接下来打开更多可能方向。',
        },
        {
          prompt: '有哪些不同的想法值得考虑？',
          title: '产生想法',
          transition: '接下来比较最有潜力的想法。',
        },
        { prompt: '哪些想法应该进入测试？', title: '筛选想法', transition: '最后明确第一个测试。' },
      ],
    },
    DECISION: {
      coverage: ['选项', '标准', '决策'],
      topics: [
        {
          prompt: '目前真正可行的选项有哪些？',
          title: '可行选项',
          transition: '接下来用明确标准比较选项。',
        },
        {
          prompt: '哪些权衡最重要？',
          title: '标准与风险',
          transition: '接下来依据这些标准做出决策。',
        },
        {
          prompt: '决策负责人可以承诺什么？',
          title: '决策与下一步',
          transition: '最后确认一个有负责人的下一步。',
        },
      ],
    },
    GENERAL: {
      coverage: ['背景', '讨论', '下一步'],
      topics: [
        {
          prompt: '所有人需要共享哪些背景？',
          title: '共同背景',
          transition: '接下来进入核心讨论。',
        },
        {
          prompt: '团队必须讨论清楚什么？',
          title: '核心讨论',
          transition: '接下来把讨论转化为结果。',
        },
        { prompt: '会议之后要发生什么？', title: '结果与下一步', transition: '最后明确负责人。' },
      ],
    },
    RETRO: {
      coverage: ['事实', '学习', '改进'],
      topics: [
        {
          prompt: '不加解释地看，实际发生了什么？',
          title: '共同事实',
          transition: '接下来从事实中寻找规律。',
        },
        {
          prompt: '哪些因素促进或阻碍了结果？',
          title: '关键学习',
          transition: '接下来把学习转化为改变。',
        },
        { prompt: '下次应该尝试什么？', title: '具体改进', transition: '最后确认具体实验。' },
      ],
    },
  },
  'zh-TW': {
    BRAINSTORM: {
      coverage: ['挑戰', '想法', '篩選'],
      topics: [
        { prompt: '我們要解決什麼挑戰？', title: '釐清挑戰', transition: '接著開啟更多可能方向。' },
        {
          prompt: '有哪些不同想法值得考慮？',
          title: '產生想法',
          transition: '接著比較最有潛力的想法。',
        },
        { prompt: '哪些想法應該進入測試？', title: '篩選想法', transition: '最後確認第一個測試。' },
      ],
    },
    DECISION: {
      coverage: ['選項', '標準', '決策'],
      topics: [
        {
          prompt: '目前真正可行的選項有哪些？',
          title: '可行選項',
          transition: '接著用明確標準比較選項。',
        },
        {
          prompt: '哪些取捨最重要？',
          title: '標準與風險',
          transition: '接著依據這些標準做出決策。',
        },
        {
          prompt: '決策負責人可以承諾什麼？',
          title: '決策與下一步',
          transition: '最後確認一個有負責人的下一步。',
        },
      ],
    },
    GENERAL: {
      coverage: ['背景', '討論', '下一步'],
      topics: [
        { prompt: '所有人需要共享哪些背景？', title: '共同背景', transition: '接著進入核心討論。' },
        {
          prompt: '團隊必須討論清楚什麼？',
          title: '核心討論',
          transition: '接著把討論轉化為結果。',
        },
        { prompt: '會議之後要發生什麼？', title: '結果與下一步', transition: '最後確認負責人。' },
      ],
    },
    RETRO: {
      coverage: ['事實', '學習', '改進'],
      topics: [
        {
          prompt: '不加解釋地看，實際發生了什麼？',
          title: '共同事實',
          transition: '接著從事實中尋找規律。',
        },
        {
          prompt: '哪些因素促進或阻礙了結果？',
          title: '關鍵學習',
          transition: '接著把學習轉化為改變。',
        },
        { prompt: '下次應該嘗試什麼？', title: '具體改進', transition: '最後確認具體實驗。' },
      ],
    },
  },
};

function readinessForMode(mode: MeetingMode, complete: boolean): ReadinessDimension[] {
  return [...sharedReadinessDimensionKeys, ...modeReadinessDimensionKeys[mode]].map(
    (key, index) => ({
      key,
      status: complete ? (index === 0 ? 'READY' : 'PARTIAL') : index === 0 ? 'PARTIAL' : 'MISSING',
    }),
  );
}

function truncate(value: string, maximum: number): string {
  const codePoints = [...value.trim()].slice(0, maximum);
  while (codePoints.join('').length > maximum) codePoints.pop();
  return codePoints.join('').trim();
}

function truncateTitle(value: string): string {
  const codePoints = [...value.trim()].slice(0, maximumNodeTitleGraphemes);
  while (codePoints.join('').length > maximumNodeTitleGraphemes) codePoints.pop();
  const title = codePoints.join('').trim();
  if (title === '' || graphemeCount(title) > maximumNodeTitleGraphemes) {
    throw new Error('Unable to derive a valid map title');
  }
  return title;
}

export function createDeterministicGrillFallback(
  input: GrillInput,
  outputLocale: SupportedLocale,
): GrillOutput {
  const copy = grillCopy[outputLocale];
  const complete = input.finishRequested === true;
  const readiness = {
    dimensions: readinessForMode(input.mode, complete),
    level: complete ? ('BARELY_READY' as const) : ('INSUFFICIENT' as const),
  };
  const updatedState = structuredClone(input.knownState);
  if (!complete) {
    return parseGrillOutput(input, {
      ...(input.phase === 'CRITICAL_EXTRA' ? { criticalExtraReason: copy.criticalReason } : {}),
      question: copy.question[input.mode],
      readiness,
      reason: copy.reason,
      shouldAsk: true,
      updatedState,
    });
  }

  const objective = truncate(input.rawRequest, 2_000);
  const confirmed =
    input.knownState.confirmed.length > 0
      ? input.knownState.confirmed
      : [truncate(input.rawRequest, 500)];
  const unknowns =
    input.knownState.unknowns.length > 0 ? input.knownState.unknowns : [copy.unknown];
  return parseGrillOutput(input, {
    readiness,
    shouldAsk: false,
    suggestedBrief: {
      assumptions: input.knownState.assumptions,
      confirmed,
      desiredOutcome: copy.desiredOutcome[input.mode],
      facilitation: {
        closingChecklist: copy.checklist,
        openingLine: copy.openingLine,
      },
      objective,
      unknowns,
    },
    updatedState,
  });
}

export function createDeterministicInitialMapFallback(
  input: InitialMapInput,
  outputLocale: SupportedLocale,
): InitialMapOutput {
  const copy = mapCopy[outputLocale][input.mode];
  return parseProviderInitialMapOutput({
    objective: { title: truncateTitle(input.brief.objective) },
    templateCoverage: copy.coverage,
    topics: copy.topics.map(({ prompt, title, transition }) => ({
      title,
      topicPrompt: prompt,
      transitionHint: transition,
    })),
  });
}

function exampleObjective(mode: MeetingMode, locale: SupportedLocale): string {
  const values: Record<SupportedLocale, Record<MeetingMode, string>> = {
    'en-US': {
      BRAINSTORM: 'Generate launch ideas',
      DECISION: 'Choose a launch plan',
      GENERAL: 'Align on the launch',
      RETRO: 'Learn from the delayed launch',
    },
    'zh-CN': {
      BRAINSTORM: '产生发布创意',
      DECISION: '选择发布方案',
      GENERAL: '就发布计划达成一致',
      RETRO: '总结发布延期的经验',
    },
    'zh-TW': {
      BRAINSTORM: '產生發布創意',
      DECISION: '選擇發布方案',
      GENERAL: '就發布計畫達成共識',
      RETRO: '整理發布延遲的經驗',
    },
  };
  return values[locale][mode];
}

export function createGrillFewShotFixture(
  mode: MeetingMode,
  outputLocale: SupportedLocale,
  branch: GrillOutputBranch,
): { input: GrillInput; output: GrillOutput } {
  const input: GrillInput = {
    ...(branch === 'COMPLETE' ? { finishRequested: true as const } : {}),
    history: [],
    knownState: { assumptions: [], confirmed: [], unknowns: [] },
    mode,
    phase: 'DEFAULT',
    rawRequest: exampleObjective(mode, outputLocale),
    turnIndex: 0,
  };
  return { input, output: createDeterministicGrillFallback(input, outputLocale) };
}

export function createInitialMapFewShotFixture(
  mode: MeetingMode,
  outputLocale: SupportedLocale,
): { input: InitialMapInput; output: ProviderInitialMapOutput } {
  const objective = exampleObjective(mode, outputLocale);
  const brief: MeetingBriefSnapshot = {
    assumptions: [grillCopy[outputLocale].unknown],
    confirmed: [objective],
    confirmedAt: '2026-01-01T00:00:00.000Z',
    desiredOutcome: grillCopy[outputLocale].desiredOutcome[mode],
    facilitation: {
      closingChecklist: grillCopy[outputLocale].checklist,
      openingLine: grillCopy[outputLocale].openingLine,
    },
    objective,
    readiness: {
      dimensions: readinessForMode(mode, true),
      level: 'BARELY_READY',
    },
    unknowns: [grillCopy[outputLocale].unknown],
  };
  const input: InitialMapInput = { brief, mode };
  const copy = mapCopy[outputLocale][mode];
  return {
    input,
    output: {
      objective: { title: truncateTitle(objective) },
      templateCoverage: copy.coverage,
      topics: copy.topics.map(({ prompt, title, transition }) => ({
        title,
        topicPrompt: prompt,
        transitionHint: transition,
      })),
    },
  };
}
