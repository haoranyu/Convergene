export function escapeMarkdown(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/([`*_[\]<>#|])/g, '\\$1')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function markdownTable(headers: readonly string[], rows: readonly string[][]): string {
  const header = `| ${headers.map(escapeMarkdown).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((value) => escapeMarkdown(value)).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

export function formatTemplate(
  template: string,
  values: Readonly<Record<string, number | string>>,
): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function truncateGraphemes(value: string, maximum: number): string {
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.trim()),
  ].map((segment) => segment.segment);
  return graphemes.length <= maximum
    ? graphemes.join('')
    : `${graphemes.slice(0, maximum - 1).join('')}…`;
}
