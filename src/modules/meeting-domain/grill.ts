import { isCanonicalUtcTimestamp, type Result } from '@/modules/shared';

import type {
  GrillKnownState,
  GrillPhase,
  GrillTurn,
  GrillTurnDisposition,
  MeetingMode,
  ReadinessDimension,
} from './model';

export const sharedReadinessDimensionKeys = [
  'objective',
  'desired_outcome',
  'participants_and_authority',
  'inputs',
  'constraints',
  'minimum_outcome',
] as const;

export const modeReadinessDimensionKeys = {
  BRAINSTORM: ['challenge', 'target_audience', 'creative_constraints', 'selection_method'],
  DECISION: ['decision_owner', 'options', 'criteria', 'decision_deadline'],
  GENERAL: [],
  RETRO: ['scope', 'facts', 'expected_vs_actual', 'desired_improvement'],
} as const satisfies Record<MeetingMode, readonly string[]>;

export type GrillPolicyErrorCode = 'GRILL_LIMIT_REACHED' | 'INVALID_GRILL_TURN';

function failure(code: GrillPolicyErrorCode): Result<never, GrillPolicyErrorCode> {
  return { error: { code }, ok: false };
}

function nonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function boundedStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 30 &&
    value.every((item) => typeof item === 'string' && item.trim() !== '' && item.length <= 500)
  );
}

function validKnownState(value: GrillKnownState): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    boundedStringList(value.confirmed) &&
    boundedStringList(value.assumptions) &&
    boundedStringList(value.unknowns)
  );
}

function validReadinessDimensions(
  mode: MeetingMode,
  dimensions: readonly ReadinessDimension[],
): boolean {
  const expected = new Set<string>([
    ...sharedReadinessDimensionKeys,
    ...modeReadinessDimensionKeys[mode],
  ]);
  const keys = dimensions.map(({ key }) => key);

  if (dimensions.length < 6 || dimensions.length > 10 || new Set(keys).size !== keys.length) {
    return false;
  }
  if (
    dimensions.some(
      (dimension) =>
        typeof dimension.key !== 'string' ||
        dimension.key.trim() === '' ||
        dimension.key.length > 80 ||
        (dimension.status !== 'MISSING' &&
          dimension.status !== 'PARTIAL' &&
          dimension.status !== 'READY') ||
        (dimension.summary !== undefined &&
          (typeof dimension.summary !== 'string' || dimension.summary.length > 500)),
    )
  ) {
    return false;
  }

  if (mode === 'GENERAL') {
    const customKeys = keys.filter((key) => !expected.has(key));
    return (
      customKeys.length <= 2 && sharedReadinessDimensionKeys.every((key) => keys.includes(key))
    );
  }

  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

export function validateGrillTurn(
  turn: GrillTurn,
  mode: MeetingMode,
): Result<GrillTurn, GrillPolicyErrorCode> {
  const phaseBounds: Record<GrillPhase, [minimum: number, maximum: number]> = {
    CRITICAL_EXTRA: [5, 5],
    DEFAULT: [0, 4],
    USER_EXTENDED: [5, 9],
  };
  const bounds = phaseBounds[turn.phase];

  if (
    typeof turn.id !== 'string' ||
    turn.id.trim() === '' ||
    typeof turn.meetingId !== 'string' ||
    turn.meetingId.trim() === '' ||
    !Number.isInteger(turn.index) ||
    bounds === undefined ||
    turn.index < bounds[0] ||
    turn.index > bounds[1] ||
    !nonEmptyString(turn.question) ||
    turn.question.length > 600 ||
    !isCanonicalUtcTimestamp(turn.createdAt) ||
    (turn.reason !== undefined && (!nonEmptyString(turn.reason) || turn.reason.length > 600)) ||
    !validKnownState(turn.knownState) ||
    turn.readiness === null ||
    typeof turn.readiness !== 'object' ||
    (turn.readiness.level !== 'INSUFFICIENT' &&
      turn.readiness.level !== 'BARELY_READY' &&
      turn.readiness.level !== 'READY') ||
    !Array.isArray(turn.readiness.dimensions) ||
    !validReadinessDimensions(mode, turn.readiness.dimensions) ||
    (turn.phase === 'CRITICAL_EXTRA') !== nonEmptyString(turn.criticalExtraReason) ||
    (turn.criticalExtraReason !== undefined && turn.criticalExtraReason.length > 600)
  ) {
    return failure('INVALID_GRILL_TURN');
  }

  if (
    turn.disposition === 'PENDING'
      ? turn.answer !== undefined
      : turn.disposition === 'ANSWERED'
        ? !nonEmptyString(turn.answer) || turn.answer.length > 4_000
        : (turn.disposition !== 'UNKNOWN' && turn.disposition !== 'SKIPPED') ||
          turn.answer !== undefined
  ) {
    return failure('INVALID_GRILL_TURN');
  }

  return { ok: true, value: turn };
}

export function validateGrillHistory(
  turns: readonly GrillTurn[],
  mode: MeetingMode,
): Result<readonly GrillTurn[], GrillPolicyErrorCode> {
  const ordered = [...turns].sort((left, right) => left.index - right.index);
  if (
    ordered.length > 10 ||
    ordered.some((turn, index) => turn.index !== index || !validateGrillTurn(turn, mode).ok) ||
    ordered.filter(({ phase }) => phase === 'CRITICAL_EXTRA').length > 1 ||
    ordered.filter(({ disposition }) => disposition === 'PENDING').length > 1 ||
    ordered.some((turn, index) => turn.disposition === 'PENDING' && index !== ordered.length - 1)
  ) {
    return failure('INVALID_GRILL_TURN');
  }

  return { ok: true, value: ordered };
}

export function answerGrillTurn(
  turn: GrillTurn,
  mode: MeetingMode,
  disposition: GrillTurnDisposition,
  answer?: string,
): Result<GrillTurn, GrillPolicyErrorCode> {
  if (turn.disposition !== 'PENDING') return failure('INVALID_GRILL_TURN');
  const completed = { ...turn, answer, disposition };
  return validateGrillTurn(completed, mode);
}

export function nextGrillPhase(
  turns: readonly GrillTurn[],
  intent: 'CONTINUE_DEFAULT' | 'CONTINUE_USER',
): Result<GrillPhase, GrillPolicyErrorCode> {
  const completedCount = turns.filter(({ disposition }) => disposition !== 'PENDING').length;
  if (turns.some(({ disposition }) => disposition === 'PENDING')) {
    return failure('INVALID_GRILL_TURN');
  }
  if (completedCount >= 10) return failure('GRILL_LIMIT_REACHED');
  if (intent === 'CONTINUE_USER') return { ok: true, value: 'USER_EXTENDED' };
  if (completedCount < 5) return { ok: true, value: 'DEFAULT' };
  if (completedCount === 5 && !turns.some(({ phase }) => phase === 'CRITICAL_EXTRA')) {
    return { ok: true, value: 'CRITICAL_EXTRA' };
  }
  return failure('GRILL_LIMIT_REACHED');
}
