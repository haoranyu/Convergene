import '@arco-design/web-react/dist/css/arco.css';
import '@/app/globals.css';

import { NextIntlClientProvider } from 'next-intl';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import enUS from '../../../messages/en-US.json';
import { subtreeNodeIds } from '@/modules/mind-map-domain';
import { layoutMeetingGraph } from '@/modules/mind-map-layout';
import { AppProviders } from '@/ui/app-providers';

import type { CanvasCommandResult, CanvasCommands } from './canvas-contract';
import { meetingGraph } from './canvas-view-model';
import { createMeetingCanvasTestFixture } from './meeting-canvas-test-fixture';
import { MeetingCanvasView } from './meeting-canvas-view';

export interface MeetingCanvasCommandProbe {
  name: keyof CanvasCommands;
  nodeId?: string;
}

export interface MeetingCanvasBrowserProbe {
  commandLog: MeetingCanvasCommandProbe[];
}

declare global {
  interface Window {
    __convergeneMeetingCanvasProbe?: MeetingCanvasBrowserProbe;
  }
}

const commandLog: MeetingCanvasCommandProbe[] = [];
window.__convergeneMeetingCanvasProbe = { commandLog };

function success(): Promise<CanvasCommandResult> {
  return Promise.resolve({ ok: true });
}

function MeetingCanvasBrowserFixture() {
  const [aggregate, setAggregate] = useState(createMeetingCanvasTestFixture);
  const commands = useMemo<CanvasCommands>(
    () => ({
      deleteSubtree: (nodeId) => {
        commandLog.push({ name: 'deleteSubtree', nodeId });
        setAggregate((current) => {
          const subtree = subtreeNodeIds(meetingGraph(current), nodeId);
          if (!subtree.ok) return current;
          const deleted = new Set(subtree.value);
          return {
            ...current,
            edges: current.edges.filter(
              (edge) => !deleted.has(edge.sourceNodeId) && !deleted.has(edge.targetNodeId),
            ),
            nodes: current.nodes.filter((node) => !deleted.has(node.id)),
            outcomes: current.outcomes.filter((outcome) => !deleted.has(outcome.nodeId)),
          };
        });
        return success();
      },
      insertNode: (input) => {
        const nodeId = `manual-${commandLog.length}`;
        commandLog.push({ name: 'insertNode', nodeId });
        setAggregate((current) => ({
          ...current,
          edges: [
            ...current.edges,
            {
              id: `edge-${nodeId}`,
              kind: 'CONTAINS',
              meetingId: current.meeting.id,
              sourceNodeId: input.parentNodeId,
              targetNodeId: nodeId,
            },
          ],
          nodes: [
            ...current.nodes,
            {
              ...input,
              createdAt: current.meeting.updatedAt,
              id: nodeId,
              meetingId: current.meeting.id,
              source: 'USER',
              updatedAt: current.meeting.updatedAt,
            },
          ],
        }));
        return success();
      },
      persistPosition: (nodeId, position) => {
        commandLog.push({ name: 'persistPosition', nodeId });
        setAggregate((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === nodeId ? { ...node, position: { ...position } } : node,
          ),
        }));
        return success();
      },
      relayout: (graph) => {
        commandLog.push({ name: 'relayout' });
        const layout = layoutMeetingGraph(graph);
        if (!layout.ok) {
          return Promise.resolve({
            error: { code: 'INVALID_OPERATION' as const },
            ok: false as const,
          });
        }
        setAggregate((current) => ({
          ...current,
          edges: layout.value.edges,
          nodes: layout.value.nodes,
        }));
        return success();
      },
      reparentNode: (nodeId, parentNodeId) => {
        commandLog.push({ name: 'reparentNode', nodeId });
        setAggregate((current) => ({
          ...current,
          edges: current.edges.map((edge) =>
            edge.targetNodeId === nodeId ? { ...edge, sourceNodeId: parentNodeId } : edge,
          ),
        }));
        return success();
      },
      setActiveTopic: (topicNodeId) => {
        commandLog.push({ name: 'setActiveTopic', nodeId: topicNodeId });
        setAggregate((current) => ({
          ...current,
          meeting: { ...current.meeting, activeTopicNodeId: topicNodeId },
        }));
        return success();
      },
      updateNodeText: (nodeId, title, note) => {
        commandLog.push({ name: 'updateNodeText', nodeId });
        setAggregate((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === nodeId ? { ...node, note, title } : node,
          ),
        }));
        return success();
      },
    }),
    [],
  );

  return (
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <AppProviders locale="en-US">
        <main className="meeting-canvas-test-shell">
          <MeetingCanvasView aggregate={aggregate} commands={commands} />
        </main>
      </AppProviders>
    </NextIntlClientProvider>
  );
}

const testStyle = document.createElement('style');
testStyle.textContent = `
  .meeting-canvas-test-shell {
    margin: 0 auto;
    max-width: 1440px;
    padding: 16px;
  }
`;
document.head.append(testStyle);

createRoot(document.getElementById('root')!).render(<MeetingCanvasBrowserFixture />);
