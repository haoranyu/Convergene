import type { GrillTurn, Meeting, MeetingOutcome, MeetingReport } from '@/modules/meeting-domain';
import type {
  ExpansionChild,
  MeetingGraph,
  MindMapEdge,
  MindMapNode,
} from '@/modules/mind-map-domain';

export function projectMeetingReport(record: MeetingReport): MeetingReport {
  return {
    generatedAt: record.generatedAt,
    locale: record.locale,
    markdown: record.markdown,
    sourceUpdatedAt: record.sourceUpdatedAt,
  };
}

export function projectMeeting(record: Meeting): Meeting {
  const brief =
    record.brief === undefined
      ? undefined
      : {
          assumptions: [...record.brief.assumptions],
          confirmed: [...record.brief.confirmed],
          ...(record.brief.confirmedAt === undefined
            ? {}
            : { confirmedAt: record.brief.confirmedAt }),
          desiredOutcome: record.brief.desiredOutcome,
          facilitation: {
            closingChecklist: [...record.brief.facilitation.closingChecklist],
            openingLine: record.brief.facilitation.openingLine,
          },
          objective: record.brief.objective,
          readiness: {
            dimensions: record.brief.readiness.dimensions.map((dimension) => ({
              key: dimension.key,
              status: dimension.status,
              summary: dimension.summary,
            })),
            level: record.brief.readiness.level,
          },
          unknowns: [...record.brief.unknowns],
        };
  return {
    activeTopicNodeId: record.activeTopicNodeId,
    actualAttendeeCount: record.actualAttendeeCount,
    brief,
    contentLocale: record.contentLocale,
    createdAt: record.createdAt,
    endedAt: record.endedAt,
    expectedAttendeeCount: record.expectedAttendeeCount,
    id: record.id,
    mode: record.mode,
    modeReason: record.modeReason,
    preparationStage: record.preparationStage,
    rawRequest: record.rawRequest,
    report: record.report === undefined ? undefined : projectMeetingReport(record.report),
    scheduledEndAt: record.scheduledEndAt,
    scheduledStartAt: record.scheduledStartAt,
    startedAt: record.startedAt,
    status: record.status,
    title: record.title,
    updatedAt: record.updatedAt,
  };
}

export function projectNode(record: MindMapNode): MindMapNode {
  return {
    createdAt: record.createdAt,
    id: record.id,
    kind: record.kind,
    meetingId: record.meetingId,
    note: record.note,
    parentSuggestion:
      record.parentSuggestion === undefined
        ? undefined
        : {
            alternativeParentNodeIds: [...record.parentSuggestion.alternativeParentNodeIds],
            createdAt: record.parentSuggestion.createdAt,
            rationale: record.parentSuggestion.rationale,
            recommendedParentNodeId: record.parentSuggestion.recommendedParentNodeId,
          },
    position: { x: record.position.x, y: record.position.y },
    source: record.source,
    strategyId: record.strategyId,
    title: record.title,
    topicPrompt: record.topicPrompt,
    transitionHint: record.transitionHint,
    updatedAt: record.updatedAt,
  };
}

export function projectEdge(record: MindMapEdge): MindMapEdge {
  return {
    id: record.id,
    kind: record.kind,
    meetingId: record.meetingId,
    order: record.order,
    sourceNodeId: record.sourceNodeId,
    targetNodeId: record.targetNodeId,
  };
}

export function projectGraph(record: MeetingGraph): MeetingGraph {
  return {
    edges: record.edges.map(projectEdge),
    meetingId: record.meetingId,
    nodes: record.nodes.map(projectNode),
  };
}

export function projectExpansionChild(record: ExpansionChild): ExpansionChild {
  return {
    edgeId: record.edgeId,
    node: projectNode(record.node),
    order: record.order,
  };
}

export function projectOutcome(record: MeetingOutcome): MeetingOutcome {
  return {
    dueDate: record.dueDate,
    id: record.id,
    kind: record.kind,
    markedAt: record.markedAt,
    meetingId: record.meetingId,
    nodeId: record.nodeId,
    note: record.note,
    origin: record.origin,
    owner: record.owner,
  };
}

export function projectGrillTurn(record: GrillTurn): GrillTurn {
  return {
    answer: record.answer,
    criticalExtraReason: record.criticalExtraReason,
    createdAt: record.createdAt,
    disposition: record.disposition,
    id: record.id,
    index: record.index,
    knownState: {
      assumptions: [...record.knownState.assumptions],
      confirmed: [...record.knownState.confirmed],
      unknowns: [...record.knownState.unknowns],
    },
    meetingId: record.meetingId,
    phase: record.phase,
    questionType: record.questionType ?? 'FREE_TEXT',
    options: record.options?.map((option) => ({ ...option })),
    question: record.question,
    readiness: {
      dimensions: record.readiness.dimensions.map((dimension) => ({ ...dimension })),
      level: record.readiness.level,
    },
    reason: record.reason,
  };
}
