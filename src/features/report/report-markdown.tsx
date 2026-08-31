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
          a({ children, href, ...props }) {
            return href ? (
              <a href={href} {...props}>
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
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
          h1({ children, ...props }) {
            return <h3 {...props}>{children}</h3>;
          },
          h2({ children, ...props }) {
            return <h4 {...props}>{children}</h4>;
          },
          h3({ children, ...props }) {
            return <h5 {...props}>{children}</h5>;
          },
          h4({ children, ...props }) {
            return <h6 {...props}>{children}</h6>;
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
