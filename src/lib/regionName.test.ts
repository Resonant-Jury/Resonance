import { describe, it, expect } from 'vitest';
import { PROFILE_REGIONS, regionCode, regionDisplayName, regionFlag, squareFlagCode } from './regionName';

describe('profile regions', () => {
  it('names every offered region in the interface language, with its flag', () => {
    expect(PROFILE_REGIONS.map((r) => `${regionFlag(r)} ${regionDisplayName(r, 'zh-TW')}`)).toEqual([
      '🇹🇼 台灣',
      '🇯🇵 日本',
      '🇺🇸 美國',
      '🇰🇷 南韓',
      '🇭🇰 香港',
    ]);
    expect(regionDisplayName('KR', 'en')).toBe('South Korea');
  });

  it('draws a flag only for a two-letter code', () => {
    expect(regionFlag('tw')).toBe('🇹🇼');
    expect(regionFlag('Taiwan')).toBe('');
    expect(regionFlag('T1')).toBe('');
  });

  it('flags a region from the vendored square flags, an older UK as GB, and nothing it has no art for', () => {
    expect(PROFILE_REGIONS.map(squareFlagCode)).toEqual(['tw', 'jp', 'us', 'kr', 'hk']);
    expect(squareFlagCode('UK')).toBe('gb');
    expect(regionDisplayName(regionCode('UK'), 'zh-TW')).toBe('英國');
    expect(squareFlagCode('FR')).toBeNull();
    expect(squareFlagCode('Taiwan')).toBeNull();
  });
});
