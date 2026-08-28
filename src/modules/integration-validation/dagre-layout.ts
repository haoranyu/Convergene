import dagre from '@dagrejs/dagre';

export interface IntegrationLayoutNode {
  height: number;
  id: string;
  title: string;
  width: number;
}

export interface IntegrationLayoutEdge {
  id: string;
  order?: number;
  source: string;
  target: string;
}

export interface PositionedIntegrationNode extends IntegrationLayoutNode {
  position: { x: number; y: number };
}

export interface IntegrationLayout {
  edges: IntegrationLayoutEdge[];
  height: number;
  nodes: PositionedIntegrationNode[];
  width: number;
}

export function createLeftToRightLayout(
  nodes: IntegrationLayoutNode[],
  edges: IntegrationLayoutEdge[],
): IntegrationLayout {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    marginx: 24,
    marginy: 24,
    nodesep: 56,
    rankdir: 'LR',
    ranksep: 96,
  });

  for (const node of nodes) {
    graph.setNode(node.id, { height: node.height, width: node.width });
  }

  const edgesBySource = new Map<string, IntegrationLayoutEdge[]>();
  for (const edge of edges) {
    const siblingEdges = edgesBySource.get(edge.source) ?? [];
    siblingEdges.push(edge);
    edgesBySource.set(edge.source, siblingEdges);
  }
  const orderedEdges = [...edgesBySource.values()].flatMap((siblingEdges) =>
    siblingEdges.sort((left, right) => (right.order ?? 0) - (left.order ?? 0)),
  );

  // Dagre stacks same-rank siblings in reverse insertion order. Insert siblings
  // by descending domain order so their visual top-to-bottom order remains stable.
  for (const edge of orderedEdges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const graphSize = graph.graph();

  return {
    edges: edges.map((edge) => ({ ...edge })),
    height: graphSize.height ?? 0,
    nodes: nodes.map((node) => {
      const layoutNode = graph.node(node.id) as { x: number; y: number } | undefined;

      if (!layoutNode) {
        throw new Error(`Dagre did not position node ${node.id}`);
      }

      return {
        ...node,
        position: {
          x: layoutNode.x - node.width / 2,
          y: layoutNode.y - node.height / 2,
        },
      };
    }),
    width: graphSize.width ?? 0,
  };
}
