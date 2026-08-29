'use client';

import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './report.module.css';
import { MermaidDiagram, type ReportMermaidRenderer } from './mermaid-diagram';

export interface ReportMarkdownProps {
  markdown: string;
  renderMermaid?: ReportMermaidRenderer;
}

export function ReportMarkdown({ markdown, renderMermaid }: ReportMarkdownProps) {
  const t = useTranslations('report');

  return (
    <article className={styles.markdown}>
      <ReactMarkdown
        components={{
          code({ children, className, ...props }) {
            if (className === 'language-mermaid') {
              return (
                <MermaidDiagram
                  definition={String(children).replace(/\n$/, '')}
                  renderMermaid={renderMermaid}
                />
              );
            }
            if (className?.startsWith('language-')) {
              return (
                <pre className={styles.codeBlock}>
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children, ...props }) {
            return (
              <div
                aria-label={t('labels.scrollTable')}
                className={styles.tableRegion}
                role="region"
                tabIndex={0}
              >
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
