import { describe, expect, it } from 'vitest';

import enUS from '../../messages/en-US.json';
import zhCN from '../../messages/zh-CN.json';
import zhTW from '../../messages/zh-TW.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogs', () => {
  it('keeps all supported locales in key parity', () => {
    const referenceKeys = collectLeafKeys(zhCN).sort();

    expect(collectLeafKeys(zhTW).sort()).toEqual(referenceKeys);
    expect(collectLeafKeys(enUS).sort()).toEqual(referenceKeys);
  });
});
