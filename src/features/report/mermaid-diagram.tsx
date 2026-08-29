import { Alert, Spin } from '@arco-design/web-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

import { renderStrictMermaid, type MermaidRenderResult } from '@/modules/report-domain';

import styles from './report.module.css';

export type ReportMermaidRenderer = typeof renderStrictMermaid;

export interface MermaidDiagramProps {
  definition: string;
  renderMermaid?: ReportMermaidRenderer;
}

function MermaidDiagramRevision({
  definition,
  renderMermaid = renderStrictMermaid,
}: MermaidDiagramProps) {
  const t = useTranslations('report');
  const reactId = useId();
  const [result, setResult] = useState<MermaidRenderResult>();

  useEffect(() => {
    let active = true;
    const diagramId = `report-${reactId.replaceAll(':', '')}`;
    void renderMermaid(diagramId, definition, '').then((nextResult) => {
      if (active) setResult(nextResult);
    });
    return () => {
      active = false;
    };
  }, [definition, reactId, renderMermaid]);

  if (result === undefined) {
    return (
      <div
        aria-label={t('status.renderingDiagram')}
        className={styles.diagramLoading}
        role="status"
      >
        <Spin size={24} />
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className={styles.diagramFallback}>
        <Alert content={t('errors.mermaidFailed')} showIcon type="warning" />
        <pre aria-label={t('labels.source')} className={styles.codeBlock}>
          <code>{result.definition}</code>
        </pre>
      </div>
    );
  }
  return (
    <div
      aria-label={t('labels.diagram')}
      className={styles.diagram}
      dangerouslySetInnerHTML={{ __html: result.svg }}
      role="img"
    />
  );
}

export function MermaidDiagram(props: MermaidDiagramProps) {
  return <MermaidDiagramRevision key={props.definition} {...props} />;
}
