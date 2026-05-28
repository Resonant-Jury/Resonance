import type {
  Card,
  Connection,
  Invite,
  Notification,
  Resonance,
  User,
} from '../db/types';

/**
 * Canonical mock dataset shared by all Mock repositories.
 * These are loaded once at module time and mutated in place by mock writes.
 */

const now = new Date('2026-04-24T09:00:00.000Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

export const CURRENT_USER_ID = 'u-me';

export const USERS: User[] = [
  {
    id: 'u-me',
    handle: 'Yo',
    bio: '想把每一個日子都寫成一張卡片。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '77',
    initials: 'YO',
    accentColor: 'oklch(88% 0.08 55)',
    joinedAt: daysAgo(180),
    handleChangedAt: daysAgo(180),
  },
  {
    id: 'u-alex',
    handle: '念誠',
    bio: '在文字中尋找生命的出口，相信每段曲折都有意義。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '13',
    initials: 'NC',
    accentColor: 'oklch(90% 0.065 55)',
    joinedAt: daysAgo(420),
    handleChangedAt: daysAgo(120),
  },
  {
    id: 'u-mara',
    handle: '方方',
    bio: '喜歡觀察生活中的微光，用溫柔記錄每一個相遇。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '29',
    initials: 'FF',
    accentColor: 'oklch(94% 0.032 290)',
    joinedAt: daysAgo(260),
    handleChangedAt: daysAgo(260),
  },
  {
    id: 'u-jin',
    handle: '志豪',
    bio: '連續創業家，在失敗與重啟之間學會熱愛生活。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '41',
    initials: 'CH',
    accentColor: 'oklch(93% 0.042 140)',
    joinedAt: daysAgo(310),
    handleChangedAt: daysAgo(310),
  },
  {
    id: 'u-amara',
    handle: '雅婷',
    bio: '旅居倫敦，在異鄉練習擁抱孤獨與成長。',
    region: 'UK',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '53',
    initials: 'YT',
    accentColor: 'oklch(92% 0.075 88)',
    joinedAt: daysAgo(540),
    handleChangedAt: daysAgo(60),
  },
  {
    id: 'u-yuki',
    handle: '小薰',
    bio: '貓奴與攝影師，相信溫柔是世界最強大的力量。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: true,
    phoneHash: 'x',
    avatarSeed: '67',
    initials: 'SX',
    accentColor: 'oklch(92% 0.033 215)',
    joinedAt: daysAgo(800),
    handleChangedAt: daysAgo(200),
  },
  {
    id: 'u-lea',
    handle: '小草',
    bio: '夜車上的觀察者，記錄每一個轉瞬即逝的啟發。',
    region: 'TW',
    primaryLocale: 'zh-TW',
    autoTranslateTo: ['en'],
    verified: false,
    phoneHash: 'x',
    avatarSeed: '83',
    initials: 'CC',
    accentColor: 'oklch(89% 0.047 18)',
    joinedAt: daysAgo(90),
    handleChangedAt: daysAgo(90),
  },
];

function card(
  partial: Omit<Card, 'translations' | 'readCount' | 'resonanceCount' | 'inviteCount'> & {
    translations?: Card['translations'];
    readCount?: number;
    resonanceCount?: number;
    inviteCount?: number;
  }
): Card {
  return {
    translations: {},
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...partial,
  };
}

export const CARDS: Card[] = [
  card({
    id: 'c-alex-1',
    authorId: 'u-alex',
    thoughtCore: '當身邊的朋友都畢業了，我還留在原地',
    story:
      '在不清楚自己想要什麼的大學尾聲，我決定再給自己一些時間繼續探索、慢慢思考。當時看著身邊的朋友一個個畢業、入伍或出國，心裡其實充滿了焦慮與自我懷疑。\n\n沒想到這個曾經讓我掙扎許久的決定，卻完全影響了後來的人生走向。那一年，我慢了下來，卻也看清了前方的路。',
    tags: ['自我探索', '延畢生存', '心靈成長', '勇氣'],
    media: { type: 'image', url: 'https://i.meee.com.tw/VYo4c2E.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(1),
    readCount: 1254,
    resonanceCount: 89,
    inviteCount: 12,
    accentHue: 55,
  }),
  card({
    id: 'c-me-1',
    authorId: 'u-me',
    thoughtCore: '寫下一句話，就像點亮一盞燈。',
    story:
      '今天下午下了一場奇怪的雨，陽台的曬衣夾掉在地上。我撿起來的時候突然想到，有些很小的事，其實一直在等我注意到它。\n\n我把今天這場雨記下來，不是因為它多特別，而是因為我願意停下來看它。',
    tags: ['慢生活', '當下觀察', '書寫療癒', '生活詩意'],
    media: { type: 'image', url: 'https://i.meee.com.tw/nrNDvun.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(0),
    readCount: 82,
    resonanceCount: 9,
    inviteCount: 1,
    accentHue: 290,
  }),
  card({
    id: 'c-yuki-1',
    authorId: 'u-yuki',
    thoughtCore: '收養流浪貓的那一天，我也被溫柔地收編了',
    story:
      '剛把小黑帶回家時，牠總是躲在沙發底下發抖。為了贏得牠的信任，我學著慢下來、輕聲說話、耐心地等待。\n\n後來我才發現，在治癒牠的過程中，我那個總是緊繃、追求完美的靈魂，也慢慢在牠的呼嚕聲中得到了慰藉。原來，照顧一個生命，其實是在學習如何溫柔地對待那個同樣脆弱、同樣需要被愛的自己。',
    tags: ['寵物療癒', '生命陪伴', '溫柔力量', '愛的回應'],
    media: { type: 'image', url: 'https://i.meee.com.tw/avAKDM4.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(10),
    readCount: 4521,
    resonanceCount: 612,
    inviteCount: 56,
    accentHue: 18,
  }),
  card({
    id: 'c-amara-1',
    authorId: 'u-amara',
    thoughtCore: '在異鄉的第一個除夕夜，我學會了與寂寞共處',
    story:
      '留學的第一年，倫敦的冬夜特別冷。除夕那天，我一個人坐在宿舍煮了一碗泡麵，聽著窗外的雨聲。\n\n那是我第一次如此強烈地感覺到孤獨，卻也是在那一晚，我學會了如何安撫自己的焦慮。我打開電腦，寫了一封長長的信給家裡的阿嬤。我發現，當你擁抱孤獨，它就不再是敵人，而是一面能照見真實自我的鏡子。',
    tags: ['異鄉成長', '擁抱孤獨', '自我對話', '心靈平靜'],
    media: { type: 'image', url: 'https://i.meee.com.tw/jhZwA39.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(5),
    readCount: 1542,
    resonanceCount: 128,
    inviteCount: 18,
    accentHue: 88,
  }),
  card({
    id: 'c-mara-1',
    authorId: 'u-mara',
    thoughtCore: '與 Max 老師的相遇，重新定義了我的生命導航',
    story:
      '那些年在 Max 老師課堂上的點滴，至今仍深刻地印在腦海中。老師從不只是傳授知識，更多的是分享他對生命的熱忱與對學生的溫柔。\n\n在最迷惘的時期，是他的一句話點醒了我：「不要怕走錯路，只要心是對的，每一段曲折都是風景。」這場相遇，徹底改變了我看待世界的視角，也讓我學會了如何用生命去影響另一個生命。',
    tags: ['導師啟發', '生命教育', '溫柔成長', '心靈契合'],
    media: { type: 'image', url: 'https://i.meee.com.tw/avAKDM4.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(3),
    readCount: 2105,
    resonanceCount: 342,
    inviteCount: 45,
    accentHue: 290,
  }),
  card({
    id: 'c-alex-2',
    authorId: 'u-alex',
    thoughtCore: '研究所申請落榜，卻意外與《臣服實驗》相遇',
    story:
      '研究所申請失利的打擊，曾讓我以為世界要崩塌了。雖然消沈了兩天，但我意外讀到了麥克·辛格（Michael Singer）所寫的《臣服實驗》。\n\n書中提到的「臣服」並非放棄，而是接受生命帶來的挑戰並全力以赴。這讓我重新審視那次失敗——或許生命正在為我關上一扇不適合的門，好讓我走向更廣闊的草原。我學會了不再執著於「一定要怎樣」，而是看見「現在可以怎樣」。',
    tags: ['臣服實驗', '逆境成長', '閱讀力量', '心靈勵志'],
    media: { type: 'image', url: 'https://i.meee.com.tw/DfR6xDc.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(2),
    readCount: 842,
    resonanceCount: 156,
    inviteCount: 24,
    accentHue: 140,
  }),
  // Current-user cards
  card({
    id: 'c-jin-1',
    authorId: 'u-jin',
    thoughtCore: '創業失敗後的三十天，我找回了對生活的熱愛',
    story:
      '結束公司的那個月，我每天早上都去家附近的公園散步。以前眼中只有 KPI 和融資進度，卻錯過了身邊無數的美好。\n\n現在我能因為看見一隻松鼠跳過樹枝而感到單純的快樂。卸下執行長的頭銜後，我才發現真正的價值不在於你創造了多少營收，而在於你是否能真誠地感受活著的每一刻。這三十天，是我人生中最富有的一段時光。',
    tags: ['創業人生', '重啟生活', '日常美學', '心靈韌性'],
    media: { type: 'image', url: 'https://i.meee.com.tw/dGEa5Ma.jpg' },
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: daysAgo(7),
    readCount: 3204,
    resonanceCount: 245,
    inviteCount: 32,
    accentHue: 215,
  }),
];

export const CONNECTIONS: Connection[] = [
  {
    id: 'u-alex_u-me',
    userIds: ['u-alex', 'u-me'],
    establishedAt: daysAgo(40),
  },
  {
    id: 'u-jin_u-me',
    userIds: ['u-jin', 'u-me'],
    establishedAt: daysAgo(12),
  },
];

export const INVITES: Invite[] = [
  {
    id: 'inv-1',
    fromUserId: 'u-mara',
    toUserId: 'u-me',
    message: '你寫父親那張卡,我讀了三遍。我也寫過一封沒寄的信,想告訴你這件事。',
    referenceCardId: 'c-mara-1',
    status: 'pending',
    expiresAt: new Date(now.getTime() + 5 * 86_400_000),
    createdAt: daysAgo(2),
  },
];

export const RESONANCES: Resonance[] = [
  {
    id: 'r-1',
    cardId: 'c-mara-1',
    userId: 'u-me',
    note: '讓我想到自己那封寫給阿公的。',
    createdAt: daysAgo(2),
  },
  {
    id: 'r-2',
    cardId: 'c-amara-1',
    userId: 'u-me',
    createdAt: daysAgo(5),
  },
  {
    id: 'r-3',
    cardId: 'c-alex-1',
    userId: 'u-me',
    createdAt: daysAgo(1),
  },
];

export const NOTIFICATIONS: Notification[] = [
  {
    id: 'n-1',
    userId: 'u-me',
    type: 'invite',
    payload: { inviteId: 'inv-1', fromHandle: 'mara' },
    readAt: null,
    createdAt: daysAgo(2),
  },
  {
    id: 'n-2',
    userId: 'u-me',
    type: 'resonance_summary',
    payload: { count: 4, period: 'yesterday' },
    readAt: null,
    createdAt: daysAgo(1),
  },
  {
    id: 'n-3',
    userId: 'u-me',
    type: 'translation_done',
    payload: { cardId: 'c-me-1', locale: 'en' },
    readAt: daysAgo(1),
    createdAt: daysAgo(1),
  },
];
