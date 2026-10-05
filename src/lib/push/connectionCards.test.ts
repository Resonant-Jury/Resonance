import { describe, expect, it } from 'vitest';
import { connectionCardText } from './connectionCards';

// What a new card's push says (who hears of it: test/emulator/connectionCards.emulator.test.ts).

describe('connectionCardText', () => {
  it("names the writer (a pen name: only named cards are announced) and gives the card's title", () => {
    expect(connectionCardText('zh-TW', '小明', '走路的時候')).toEqual({ title: '小明 寫了一張新卡片', body: '走路的時候' });
    expect(connectionCardText('en', 'bob', 'A walk')).toEqual({ title: 'bob wrote a new card', body: 'A walk' });
  });
});
