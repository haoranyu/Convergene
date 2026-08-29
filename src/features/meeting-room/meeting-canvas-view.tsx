'use client';

import '@xyflow/react/dist/style.css';

import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBranch,
  IconDelete,
  IconFullscreen,
  IconLayout,
  IconPlus,
  IconRefresh,
  IconSave,
} from '@arco-design/web-react/icon';
import {
  Background,
  ConnectionLineType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from '@xyflow/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MindMapNode, NodeKind } from '@/modules/mind-map-domain';
import { orderedTopicIds, subtreeNodeIds } from '@/modules/mind-map-domain';

import type { CanvasCommandErrorCode, MeetingCanvasViewProps } from './canvas-contract';
import {
  meetingEdgeTypes,
  meetingNodeTypes,
  type MeetingCanvasEdge,
  type MeetingCanvasNode,
} from './canvas-elements';
import {
  allowedParentIds,
  buildCanvasElements,
  currentParentId,
  meetingGraph,
  subtreeSize,
} from './canvas-view-model';
import styles from './meeting-canvas.module.css';
import { useReducedMotion } from './use-reduced-motion';

const childNodeKinds = ['OPTION', 'IDEA', 'RISK', 'INSIGHT', 'ACTION', 'NOTE', 'PARKING'] as const;

export function focusDuration(reducedMotion: boolean, scope: 'all' | 'topic'): number {
  if (reducedMotion) return 0;
  return scope === 'topic' ? 250 : 200;
}

function errorKey(code: CanvasCommandErrorCode): string {
  if (code === 'STALE_WRITE') return 'errors.stale';
  if (code === 'STORAGE_ERROR') return 'errors.storage';
  return 'errors.invalidOperation';
}

function CanvasContent({ aggregate, commands }: MeetingCanvasViewProps) {
  const t = useTranslations('mindMap');
  const reducedMotion = useReducedMotion();
  const instanceRef = useRef<ReactFlowInstance<MeetingCanvasNode, MeetingCanvasEdge> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string }>();
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState<NodeKind>('NOTE');
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newTopicPrompt, setNewTopicPrompt] = useState('');
  const [newTransitionHint, setNewTransitionHint] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [nextParentId, setNextParentId] = useState<string>();

  const nodeKindLabels = useMemo<Record<NodeKind, string>>(
    () => ({
      ACTION: t('nodeKinds.ACTION'),
      IDEA: t('nodeKinds.IDEA'),
      INSIGHT: t('nodeKinds.INSIGHT'),
      NOTE: t('nodeKinds.NOTE'),
      OBJECTIVE: t('nodeKinds.OBJECTIVE'),
      OPTION: t('nodeKinds.OPTION'),
      PARKING: t('nodeKinds.PARKING'),
      RISK: t('nodeKinds.RISK'),
      TOPIC: t('nodeKinds.TOPIC'),
    }),
    [t],
  );
  const labels = useMemo(
    () => ({
      activeTopic: t('activeTopic.label'),
      nodeKinds: nodeKindLabels,
      outcome: t('node.outcome'),
    }),
    [nodeKindLabels, t],
  );
  const graph = useMemo(() => meetingGraph(aggregate), [aggregate]);
  const elements = useMemo(
    () => buildCanvasElements(aggregate, labels, selectedNodeId),
    [aggregate, labels, selectedNodeId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<MeetingCanvasNode>(elements.nodes);

  useEffect(() => setNodes(elements.nodes), [elements.nodes, setNodes]);
  const selectedNode = aggregate.nodes.find((node) => node.id === selectedNodeId);
  const selectNode = useCallback(
    (nodeId?: string) => {
      const node = aggregate.nodes.find((candidate) => candidate.id === nodeId);
      setSelectedNodeId(node?.id);
      setEditTitle(node?.title ?? '');
      setEditNote(node?.note ?? '');
      setNextParentId(undefined);
    },
    [aggregate.nodes],
  );

  const topicsResult = useMemo(() => orderedTopicIds(graph), [graph]);
  const topicIds = topicsResult.ok ? topicsResult.value : [];
  const topicIndex = aggregate.meeting.activeTopicNodeId
    ? topicIds.indexOf(aggregate.meeting.activeTopicNodeId)
    : -1;
  const activeTopic = aggregate.nodes.find(
    (node) => node.id === aggregate.meeting.activeTopicNodeId,
  );
  const isStructuralEditingAllowed = aggregate.meeting.status !== 'ENDED';

  const runCommand = useCallback(
    async (
      name: string,
      command: () => ReturnType<MeetingCanvasViewProps['commands']['relayout']>,
    ) => {
      if (pendingAction !== undefined) return false;
      setPendingAction(name);
      setNotice(undefined);
      try {
        const result = await command();
        if (!result.ok) {
          setNotice({ kind: 'error', text: t(errorKey(result.error.code)) });
          return false;
        }
        setNotice({ kind: 'success', text: t('feedback.saved') });
        return true;
      } finally {
        setPendingAction(undefined);
      }
    },
    [pendingAction, t],
  );

  const focusSubtree = useCallback(
    (topicNodeId: string) => {
      const subtree = subtreeNodeIds(graph, topicNodeId);
      const instance = instanceRef.current;
      if (!subtree.ok || instance === null) return;
      const ids = new Set(subtree.value);
      const focusedNodes = instance.getNodes().filter((node) => ids.has(node.id));
      void instance.fitView({
        duration: focusDuration(reducedMotion, 'topic'),
        maxZoom: 1.35,
        minZoom: 0.45,
        nodes: focusedNodes,
        padding: 0.18,
      });
    },
    [graph, reducedMotion],
  );

  const activateTopic = useCallback(
    async (topicNodeId: string) => {
      if (aggregate.meeting.status !== 'LIVE') {
        focusSubtree(topicNodeId);
        return;
      }
      if (await runCommand('active-topic', () => commands.setActiveTopic(topicNodeId))) {
        focusSubtree(topicNodeId);
      }
    },
    [aggregate.meeting.status, commands, focusSubtree, runCommand],
  );

  const fitAll = useCallback(() => {
    const instance = instanceRef.current;
    if (instance === null) return;
    void instance.fitView({
      duration: focusDuration(reducedMotion, 'all'),
      maxZoom: 1.2,
      minZoom: 0.35,
      nodes: instance.getNodes(),
      padding: 0.12,
    });
  }, [reducedMotion]);

  const parentOptions = useMemo(() => {
    if (selectedNode === undefined) return [];
    const current = currentParentId(aggregate, selectedNode.id);
    const candidates = allowedParentIds(aggregate, selectedNode.id).filter((candidateId) => {
      if (candidateId === current) return false;
      const candidate = aggregate.nodes.find((node) => node.id === candidateId);
      if (candidate === undefined) return false;
      if (selectedNode.kind === 'TOPIC') return candidate.id === elements.rootNodeId;
      return candidate.id !== elements.rootNodeId;
    });
    return candidates.map((id) => {
      const candidate = aggregate.nodes.find((node) => node.id === id)!;
      return { label: candidate.title, value: candidate.id };
    });
  }, [aggregate, elements.rootNodeId, selectedNode]);

  const isValidConnection = useCallback<IsValidConnection<MeetingCanvasEdge>>(
    (connection) => {
      if (!isStructuralEditingAllowed || connection.source === connection.target) return false;
      const target = aggregate.nodes.find((node) => node.id === connection.target);
      if (target === undefined || target.id === elements.rootNodeId) return false;
      if (target.kind === 'TOPIC') return connection.source === elements.rootNodeId;
      return (
        connection.source !== elements.rootNodeId &&
        allowedParentIds(aggregate, target.id).includes(connection.source)
      );
    },
    [aggregate, elements.rootNodeId, isStructuralEditingAllowed],
  );

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      if (!isValidConnection(connection)) return;
      void runCommand('reparent', () =>
        commands.reparentNode(connection.target, connection.source),
      );
    },
    [commands, isValidConnection, runCommand],
  );

  const onNodeClick = useCallback<NodeMouseHandler<MeetingCanvasNode>>(
    (_event, node) => selectNode(node.id),
    [selectNode],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => selectNode(selected.at(-1)?.id),
    [selectNode],
  );

  async function saveNodeText() {
    if (selectedNode === undefined || editTitle.trim() === '') return;
    await runCommand('save-node', () =>
      commands.updateNodeText(
        selectedNode.id,
        editTitle.trim(),
        editNote.trim() === '' ? undefined : editNote.trim(),
      ),
    );
  }

  function openAddNode() {
    if (selectedNode === undefined) return;
    setNewKind(selectedNode.id === elements.rootNodeId ? 'TOPIC' : 'NOTE');
    setNewTitle('');
    setNewNote('');
    setNewTopicPrompt('');
    setNewTransitionHint('');
    setAddOpen(true);
  }

  async function addNode() {
    if (selectedNode === undefined || newTitle.trim() === '') return;
    if (newKind === 'TOPIC' && (newTopicPrompt.trim() === '' || newTransitionHint.trim() === '')) {
      return;
    }
    const siblingCount = aggregate.edges.filter(
      (edge) => edge.sourceNodeId === selectedNode.id,
    ).length;
    const saved = await runCommand('add-node', () =>
      commands.insertNode({
        kind: newKind,
        note: newNote.trim() === '' ? undefined : newNote.trim(),
        parentNodeId: selectedNode.id,
        position: {
          x: selectedNode.position.x + 384,
          y: selectedNode.position.y + siblingCount * 112,
        },
        title: newTitle.trim(),
        topicPrompt: newKind === 'TOPIC' ? newTopicPrompt.trim() : undefined,
        transitionHint: newKind === 'TOPIC' ? newTransitionHint.trim() : undefined,
      }),
    );
    if (saved) setAddOpen(false);
  }

  const activePosition =
    topicIndex >= 0
      ? t('activeTopic.position', { current: topicIndex + 1, total: topicIds.length })
      : t('activeTopic.none');

  return (
    <section
      aria-label={t('workspaceLabel')}
      className={styles.workspace}
      data-reduced-motion={reducedMotion}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selectedNodeId !== undefined) {
          selectNode();
        }
      }}
    >
      <header className={styles.toolbar}>
        <div className={styles.toolbarContext}>
          <div className={styles.brandLockup}>
            <Image
              alt=""
              className={styles.brandMark}
              data-testid="brand-mark"
              height={24}
              src="/brand/convergene-mark.svg"
              unoptimized
              width={24}
            />
            <span className={styles.brandName}>Convergene</span>
          </div>
          <div className={styles.activeSummary}>
            <span className={styles.toolbarLabel}>{t('activeTopic.label')}</span>
            <Typography.Text bold data-testid="active-topic-title">
              {activeTopic?.title ?? t('activeTopic.none')}
            </Typography.Text>
            <Tag color={aggregate.meeting.status === 'LIVE' ? 'blue' : 'gray'}>
              {activePosition}
            </Tag>
          </div>
        </div>
        <Space className={styles.toolbarActions} size="small" wrap>
          <Button
            aria-label={t('actions.previousTopic')}
            disabled={topicIndex <= 0 || pendingAction !== undefined}
            icon={<IconArrowLeft />}
            onClick={() => void activateTopic(topicIds[topicIndex - 1]!)}
          >
            {t('actions.previousTopic')}
          </Button>
          <Button
            aria-label={t('actions.nextTopic')}
            disabled={
              topicIndex < 0 || topicIndex >= topicIds.length - 1 || pendingAction !== undefined
            }
            icon={<IconArrowRight />}
            onClick={() => void activateTopic(topicIds[topicIndex + 1]!)}
          >
            {t('actions.nextTopic')}
          </Button>
          <Button
            disabled={activeTopic === undefined}
            icon={<IconRefresh />}
            onClick={() => activeTopic && focusSubtree(activeTopic.id)}
          >
            {t('actions.refocus')}
          </Button>
          <Button icon={<IconFullscreen />} onClick={fitAll}>
            {t('actions.fitAll')}
          </Button>
          <Button
            disabled={!isStructuralEditingAllowed || pendingAction !== undefined}
            icon={<IconLayout />}
            loading={pendingAction === 'relayout'}
            onClick={() => void runCommand('relayout', () => commands.relayout(graph))}
          >
            {t('actions.relayout')}
          </Button>
        </Space>
      </header>

      <nav aria-label={t('activeTopic.navigationLabel')} className={styles.topicStrip}>
        {topicIds.map((topicId) => {
          const topic = aggregate.nodes.find((node) => node.id === topicId)!;
          return (
            <Button
              aria-pressed={topicId === aggregate.meeting.activeTopicNodeId}
              key={topicId}
              onClick={() => void activateTopic(topicId)}
              size="small"
              type={topicId === aggregate.meeting.activeTopicNodeId ? 'primary' : 'outline'}
            >
              {topic.title}
            </Button>
          );
        })}
      </nav>

      <div aria-live="polite" className={styles.notice} role="status">
        {notice ? (
          <Alert content={notice.text} type={notice.kind === 'error' ? 'error' : 'success'} />
        ) : null}
      </div>

      <div className={styles.desktopWorkspace}>
        <div className={styles.canvasPane} data-testid="meeting-canvas-pane">
          <ReactFlow<MeetingCanvasNode, MeetingCanvasEdge>
            connectionLineType={ConnectionLineType.SmoothStep}
            deleteKeyCode={null}
            edges={elements.edges}
            edgeTypes={meetingEdgeTypes}
            elementsSelectable
            fitView={false}
            isValidConnection={isValidConnection}
            maxZoom={1.6}
            minZoom={0.3}
            nodes={nodes}
            nodesConnectable={isStructuralEditingAllowed}
            nodeTypes={meetingNodeTypes}
            onConnect={onConnect}
            onInit={(instance) => {
              instanceRef.current = instance;
            }}
            onNodeClick={onNodeClick}
            onNodeDragStop={(_event, node) => {
              void runCommand('position', () => commands.persistPosition(node.id, node.position));
            }}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            panOnDrag
            selectNodesOnDrag={false}
            zoomOnDoubleClick={false}
          >
            <Background color="var(--color-border)" gap={24} size={1} />
          </ReactFlow>
        </div>

        <aside aria-label={t('detail.label')} className={styles.detailPanel}>
          {selectedNode === undefined ? (
            <Empty description={t('detail.empty')} />
          ) : (
            <Card bordered={false} className={styles.detailCard}>
              <div className={styles.detailHeading}>
                <div>
                  <Typography.Text className={styles.detailEyebrow}>
                    {nodeKindLabels[selectedNode.kind]}
                  </Typography.Text>
                  <Typography.Title heading={5}>{selectedNode.title}</Typography.Title>
                </div>
                {selectedNode.id === aggregate.meeting.activeTopicNodeId ? (
                  <Tag color="blue">{t('activeTopic.label')}</Tag>
                ) : null}
              </div>

              <Form layout="vertical">
                <Form.Item label={t('detail.title')} required>
                  <Input
                    aria-label={t('detail.title')}
                    maxLength={48}
                    onChange={setEditTitle}
                    showWordLimit
                    value={editTitle}
                  />
                </Form.Item>
                <Form.Item label={t('detail.note')}>
                  <Input.TextArea
                    aria-label={t('detail.note')}
                    autoSize={{ maxRows: 5, minRows: 3 }}
                    onChange={setEditNote}
                    value={editNote}
                  />
                </Form.Item>
                <Button
                  disabled={editTitle.trim() === '' || pendingAction !== undefined}
                  icon={<IconSave />}
                  loading={pendingAction === 'save-node'}
                  long
                  onClick={() => void saveNodeText()}
                  type="primary"
                >
                  {t('actions.saveNode')}
                </Button>
              </Form>

              {isStructuralEditingAllowed ? (
                <div className={styles.structureActions}>
                  <Typography.Text bold>{t('structure.label')}</Typography.Text>
                  <Button icon={<IconPlus />} long onClick={openAddNode}>
                    {t('actions.addChild')}
                  </Button>
                  {selectedNode.id !== elements.rootNodeId ? (
                    <>
                      <div className={styles.moveRow}>
                        <Select
                          aria-label={t('structure.parent')}
                          onChange={setNextParentId}
                          options={parentOptions}
                          placeholder={
                            parentOptions.length === 0
                              ? t('structure.noParentOptions')
                              : t('structure.parentPlaceholder')
                          }
                          value={nextParentId}
                        />
                        <Button
                          disabled={nextParentId === undefined || pendingAction !== undefined}
                          icon={<IconBranch />}
                          onClick={() => {
                            if (nextParentId === undefined) return;
                            void runCommand('reparent', () =>
                              commands.reparentNode(selectedNode.id, nextParentId),
                            );
                          }}
                        >
                          {t('actions.moveNode')}
                        </Button>
                      </div>
                      <Popconfirm
                        autoFocus
                        cancelText={t('actions.cancel')}
                        content={t('delete.content', {
                          count: subtreeSize(aggregate, selectedNode.id),
                        })}
                        focusLock
                        okButtonProps={{ loading: pendingAction === 'delete', status: 'danger' }}
                        okText={t('actions.confirmDelete')}
                        onOk={async () => {
                          if (
                            await runCommand('delete', () =>
                              commands.deleteSubtree(selectedNode.id),
                            )
                          ) {
                            selectNode();
                          }
                        }}
                        title={t('delete.title')}
                      >
                        <Button icon={<IconDelete />} long status="danger" type="outline">
                          {t('actions.deleteBranch')}
                        </Button>
                      </Popconfirm>
                    </>
                  ) : null}
                </div>
              ) : null}
            </Card>
          )}
        </aside>
      </div>

      <div className={styles.mobileWorkspace}>
        <Alert content={t('mobile.desktopAdvice')} showIcon type="info" />
        <Card>
          <Typography.Title heading={5}>{t('mobile.treeTitle')}</Typography.Title>
          <ul className={styles.mobileTree}>
            {topicIds.map((topicId) => {
              const topic = aggregate.nodes.find((node) => node.id === topicId)!;
              const children = aggregate.edges
                .filter((edge) => edge.sourceNodeId === topicId)
                .map((edge) => aggregate.nodes.find((node) => node.id === edge.targetNodeId))
                .filter((node): node is MindMapNode => node !== undefined);
              return (
                <li key={topic.id}>
                  <Button
                    aria-pressed={topic.id === aggregate.meeting.activeTopicNodeId}
                    long
                    onClick={() => void activateTopic(topic.id)}
                    type={topic.id === aggregate.meeting.activeTopicNodeId ? 'primary' : 'outline'}
                  >
                    {topic.title}
                  </Button>
                  {children.length > 0 ? (
                    <ul>
                      {children.map((child) => (
                        <li key={child.id}>
                          <span>{nodeKindLabels[child.kind]}</span>
                          {child.title}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Modal
        autoFocus
        escToExit
        focusLock
        maskClosable={false}
        okButtonProps={{
          disabled:
            newTitle.trim() === '' ||
            (newKind === 'TOPIC' &&
              (newTopicPrompt.trim() === '' || newTransitionHint.trim() === '')),
          loading: pendingAction === 'add-node',
        }}
        okText={t('actions.addNode')}
        onCancel={() => setAddOpen(false)}
        onOk={addNode}
        title={t('add.title')}
        unmountOnExit
        visible={addOpen}
      >
        <Form layout="vertical">
          <Form.Item label={t('add.kind')} required>
            {selectedNode?.id === elements.rootNodeId ? (
              <Tag>{nodeKindLabels.TOPIC}</Tag>
            ) : (
              <Select
                aria-label={t('add.kind')}
                onChange={setNewKind}
                options={childNodeKinds.map((kind) => ({
                  label: nodeKindLabels[kind],
                  value: kind,
                }))}
                value={newKind}
              />
            )}
          </Form.Item>
          <Form.Item label={t('detail.title')} required>
            <Input
              aria-label={t('detail.title')}
              maxLength={48}
              onChange={setNewTitle}
              showWordLimit
              value={newTitle}
            />
          </Form.Item>
          <Form.Item label={t('detail.note')}>
            <Input.TextArea
              aria-label={t('detail.note')}
              autoSize={{ maxRows: 4, minRows: 2 }}
              onChange={setNewNote}
              value={newNote}
            />
          </Form.Item>
          {newKind === 'TOPIC' ? (
            <>
              <Form.Item label={t('add.topicPrompt')} required>
                <Input
                  aria-label={t('add.topicPrompt')}
                  onChange={setNewTopicPrompt}
                  value={newTopicPrompt}
                />
              </Form.Item>
              <Form.Item label={t('add.transitionHint')} required>
                <Input
                  aria-label={t('add.transitionHint')}
                  onChange={setNewTransitionHint}
                  value={newTransitionHint}
                />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Modal>
    </section>
  );
}

export function MeetingCanvasView(props: MeetingCanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
