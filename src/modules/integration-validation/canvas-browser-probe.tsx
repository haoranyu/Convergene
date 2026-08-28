import '@xyflow/react/dist/style.css';

import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { StrictMode, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import {
  longEnglishMeetingTreeEdges,
  longEnglishMeetingTreeNodes,
} from '@/fixtures/integration-validation/long-english-meeting-tree';

import { calculateSubtreeFocus, createLeftToRightLayout } from './canvas';

interface CanvasProbeNodeData extends Record<string, unknown> {
  title: string;
}

type CanvasProbeNode = Node<CanvasProbeNodeData, 'canvasProbe'>;

export interface CanvasNodeMeasurement {
  height: number;
  id: string;
  textOverflowed: boolean;
  titleLineCount: number;
  width: number;
}

export interface CanvasBrowserProbeResult {
  fitViewInvoked: true;
  fitViewResult: boolean;
  focusedNodeIds: string[];
  nodeMeasurements: CanvasNodeMeasurement[];
  viewportAfter: Viewport;
  viewportBefore: Viewport;
}

declare global {
  interface Window {
    __convergeneCanvasProbe?: CanvasBrowserProbeResult;
  }
}

const layout = createLeftToRightLayout(longEnglishMeetingTreeNodes, longEnglishMeetingTreeEdges);

const canvasNodes: CanvasProbeNode[] = layout.nodes.map((node) => ({
  data: { title: node.title },
  id: node.id,
  position: node.position,
  style: { height: node.height, width: node.width },
  type: 'canvasProbe',
}));

const canvasEdges: Edge[] = layout.edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
}));

function ValidationNode({ data, id }: NodeProps<CanvasProbeNode>) {
  return (
    <div className="validation-node" data-validation-node={id}>
      <Handle type="target" position={Position.Left} />
      <span className="validation-node-title">{data.title}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { canvasProbe: ValidationNode };

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForNodeMeasurements(
  instance: ReactFlowInstance<CanvasProbeNode, Edge>,
): Promise<CanvasProbeNode[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await nextAnimationFrame();
    const nodes = instance.getNodes();
    if (
      instance.viewportInitialized &&
      nodes.length === longEnglishMeetingTreeNodes.length &&
      document.querySelectorAll('[data-validation-node]').length ===
        longEnglishMeetingTreeNodes.length
    ) {
      return nodes;
    }
  }

  throw new Error('React Flow did not measure every validation node');
}

function readNodeMeasurements(): CanvasNodeMeasurement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-validation-node]')].map((element) => {
    const title = element.querySelector<HTMLElement>('.validation-node-title');
    if (!title) {
      throw new Error('Validation node title is missing');
    }

    const nodeRect = element.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    const boundaryTolerance = 0.5;

    return {
      height: nodeRect.height,
      id: element.dataset.validationNode!,
      textOverflowed:
        title.scrollHeight > title.clientHeight ||
        title.scrollWidth > title.clientWidth ||
        titleRect.left < nodeRect.left - boundaryTolerance ||
        titleRect.right > nodeRect.right + boundaryTolerance ||
        titleRect.top < nodeRect.top - boundaryTolerance ||
        titleRect.bottom > nodeRect.bottom + boundaryTolerance,
      titleLineCount: Math.round(titleRect.height / lineHeight),
      width: nodeRect.width,
    };
  });
}

async function runBrowserProbe(instance: ReactFlowInstance<CanvasProbeNode, Edge>): Promise<void> {
  const measuredNodes = await waitForNodeMeasurements(instance);
  const nodeMeasurements = readNodeMeasurements();
  const focusedNodeIds = calculateSubtreeFocus(layout.nodes, layout.edges, 'topic-criteria', {
    height: 720,
    width: 1_280,
  }).nodeIds;
  const focusedNodeIdSet = new Set(focusedNodeIds);
  const focusedNodes = measuredNodes.filter((node) => focusedNodeIdSet.has(node.id));
  const viewportBefore = instance.getViewport();
  const fitViewResult = await instance.fitView({
    duration: 0,
    maxZoom: 1.5,
    minZoom: 0.5,
    nodes: focusedNodes,
    padding: 0.12,
  });
  await nextAnimationFrame();

  window.__convergeneCanvasProbe = {
    fitViewInvoked: true,
    fitViewResult,
    focusedNodeIds,
    nodeMeasurements,
    viewportAfter: instance.getViewport(),
    viewportBefore,
  };
}

function CanvasBrowserProbe() {
  const nodes = useMemo(() => canvasNodes, []);
  const edges = useMemo(() => canvasEdges, []);
  const onInit = useCallback((instance: ReactFlowInstance<CanvasProbeNode, Edge>) => {
    void runBrowserProbe(instance);
  }, []);

  return (
    <main className="canvas-probe-shell">
      <ReactFlow
        edges={edges}
        elementsSelectable={false}
        maxZoom={1.5}
        minZoom={0.5}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onInit={onInit}
        panOnDrag={false}
        zoomOnDoubleClick={false}
        zoomOnPinch={false}
        zoomOnScroll={false}
      />
    </main>
  );
}

const style = document.createElement('style');
style.textContent = `
  html, body, #root, .canvas-probe-shell {
    height: 100%;
    margin: 0;
    width: 100%;
  }

  .canvas-probe-shell {
    background: #f7f8fa;
  }

  .validation-node {
    align-items: center;
    background: #ffffff;
    border: 1px solid #c9cdd4;
    border-radius: 8px;
    box-sizing: border-box;
    display: flex;
    height: 100%;
    padding: 12px 16px;
    width: 100%;
  }

  .validation-node-title {
    color: #1d2129;
    display: block;
    font: 500 16px/20px Arial, sans-serif;
    overflow-wrap: anywhere;
    white-space: normal;
  }
`;
document.head.append(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CanvasBrowserProbe />
  </StrictMode>,
);
