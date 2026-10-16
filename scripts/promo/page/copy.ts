/**
 * Every word the promo shows. What the product itself says on screen (a
 * button, a label, a hint) is read from src/messages, so the video says
 * exactly what the app says; only the narration and the sample stories
 * are written here. Copy rule as in the app: one sentence or a fragment
 * ends without a full stop, two or more keep every stop. A narration title
 * or body may hold a "\n" where its line should break.
 */
import en from '../../../src/messages/en.json';
import zhTW from '../../../src/messages/zh-TW.json';

export type Locale = 'zh-TW' | 'en';

type Messages = typeof en;

function pick(m: Messages) {
  return {
    heroTag: m.hero.tag,
    heroPrefix: m.hero.headlinePrefix,
    heroAccent: m.hero.headlineAccent,
    heroSuffix: m.hero.headlineSuffix,
    howTitle: m.about.how.title,
    resonateBody: m.about.how.resonate.body,
    resonate: m.card.resonate,
    resonated: m.card.resonated,
    noteEntry: m.card.note.entryShort,
    bookmark: m.card.bookmark.add,
    noteLabel: m.card.note.label,
    notePlaceholder: m.card.note.placeholder,
    noteHint: m.card.note.hint,
    noteSend: m.card.note.send,
    noteCancel: m.card.note.cancel,
    noteSent: m.card.note.sent,
    publishTitle: m.write.publishPanel.title,
    insight: m.write.publishPanel.insight,
    visibilityLabel: m.write.visibility.label,
    visibilityPublic: m.write.visibility.public,
    visibilityPrivate: m.write.visibility.private,
    anonymousToggle: m.write.publishPanel.anonymousToggle,
    anonymousHint: m.write.publishPanel.anonymousHint,
    publishCancel: m.write.publishPanel.cancel,
    publish: m.write.publishPanel.publish,
    anonymousAuthor: m.card.anonymousAuthor,
    privateCard: m.card.private,
    thoughtMap: m.me.tabs.thoughtMap,
    mapAddGroup: m.me.thoughtMap.addGroup,
    mapAddCard: m.me.thoughtMap.addCard,
    mapOpen: m.me.thoughtMap.open,
    awaitingReply: m.messages.awaitingReply,
    cardSource: m.messages.cardSource,
    readMinutes: m.app.readMinutes,
    connected: m.profile.connected,
    footerTagline: m.footer.tagline,
  };
}

const NARRATION = {
  'zh-TW': {
    chapters: ['故事卡片', '公開、私人、匿名', '共振', '小紙條', '思想地圖'],
    /** The intro's line, its accent (squiggled, in terracotta) in the middle. */
    introTagline: ['用故事', '回應', '故事'],
    introSub: '回應不是按讚，而是另一段故事',
    write: {
      eyebrow: '故事卡片',
      title: '把一段人生，\n寫成一張卡片',
      body: '一個標題、一段故事，也許配一張圖。草稿會自己存好。',
    },
    visibility: {
      eyebrow: '公開、私人、匿名',
      title: '誰能讀到，\n由你決定',
      body: '公開給每個人，或只留給自己。不敢署名的故事，就匿名發布。',
      publicCaption: '每個人都讀得到',
      privateCaption: '只有你讀得到',
      anonymousCaption: '每個人都讀得到，只是不署名',
    },
    resonate: {
      eyebrow: '共振',
      title: '被觸動了，\n就寫一張卡片回應',
      body: '用你的故事回應，兩張卡片從此相連。公開署名的共振，也會讓你們連結在一起。',
    },
    notes: {
      eyebrow: '小紙條',
      title: '想說的話，\n只寫給作者',
      body: '寄一張只有作者讀得到的小紙條。等對方回信，你們就能開始聊天。',
    },
    map: {
      eyebrow: '思想地圖',
      title: '把想法攤開，\n看見它們的關聯',
      body: '把卡片放上地圖，圈成分類、畫上箭頭，寫下它們怎麼相連',
    },
    outro: {
      platforms: 'iPhone、Android、網頁版',
      url: 'resonance.channel',
    },
  },
  en: {
    chapters: ['Story cards', 'Public · Private · Anonymous', 'Resonate', 'Notes', 'Thought map'],
    introTagline: ['', 'Answer', ' stories with stories'],
    introSub: 'A response isn’t a like. It’s another story.',
    write: {
      eyebrow: 'Story cards',
      title: 'Your life,\non a card',
      body: 'A title, a story, perhaps a picture. Drafts save themselves.',
    },
    visibility: {
      eyebrow: 'Public · Private · Anonymous',
      title: 'You decide\nwho reads it',
      body: 'Share it with everyone or keep it to yourself. For a story you can’t sign, publish anonymously.',
      publicCaption: 'Anyone can read it',
      privateCaption: 'Only you can read it',
      anonymousCaption: 'Anyone can read it, just without your name',
    },
    resonate: {
      eyebrow: 'Resonate',
      title: 'Moved by a story?\nAnswer with yours',
      body: 'The two cards stay linked. If yours is public and signed, the two of you are connected too.',
    },
    notes: {
      eyebrow: 'Notes',
      title: 'Words for\nthe author alone',
      body: 'Send a note only the author can read.\nOnce they write back, you can start talking.',
    },
    map: {
      eyebrow: 'Thought map',
      title: 'See how your\nthoughts connect',
      body: 'Bring your cards onto the map, group them, and draw arrows that say how they relate',
    },
    outro: {
      platforms: 'iPhone · Android · Web',
      url: 'resonance.channel',
    },
  },
} as const;

/**
 * The sample world the scenes show. `me` writes 第一次一個人旅行 and, moved by
 * `them`'s 離家的第一個冬天, resonates with it (a public, signed resonance: the
 * two become connected). In the notes chapter `me` leaves a note on `writer`'s
 * card, someone not yet connected: a letter, until they write back. Initials
 * are the first two characters of the pen name, as the app makes them.
 */
const STORIES = {
  'zh-TW': {
    me: { name: '阿樹', initials: '阿樹' },
    them: { name: '小夏', initials: '小夏' },
    writer: { name: '晴天', initials: '晴天' },
    myCard: {
      title: '第一次一個人旅行',
      excerpt: '在花蓮的車站，我第一次發現，迷路也可以是一種自由。那天的海很藍，藍到我忘了害怕…',
      tags: ['旅行', '勇氣', '成長'],
      insight: '迷路，也可以是一種自由',
      minutes: 4,
    },
    theirCard: {
      title: '離家的第一個冬天',
      excerpt: '宿舍的暖氣壞了，我裹著外套煮了一碗泡麵，突然好想念媽媽煮的湯。原來長大，就是學會自己取暖…',
      tags: ['家', '冬天', '長大'],
      minutes: 5,
    },
    resonanceCard: {
      title: '那年，我也一個人過年',
      excerpt: '讀到你的冬天，我想起那年在異鄉的除夕。我一個人煮了火鍋，對著視訊裡的家人舉杯…',
      tags: ['家', '除夕'],
      minutes: 3,
    },
    writerCard: {
      title: '凌晨四點的便利商店',
      excerpt: '值完大夜班，我在便利商店買了一杯熱奶茶。店員說了聲「辛苦了」，那是我那天聽到最溫柔的一句話…',
      tags: ['工作', '深夜', '溫柔'],
      minutes: 3,
    },
    note: '謝謝你寫下這段，我也上過好幾年大夜班，那句「辛苦了」好像也是對我說的',
    reply: '謝謝你的小紙條，原來那份溫柔，也傳到你那裡了',
    map: {
      /** My cards and the one I resonated with: 0 my trip, 1 the day I quit, 2 drawing again, 3 小夏's winter, 4 my New Year. */
      cards: ['第一次一個人旅行', '辭職那天', '重新開始畫畫', '離家的第一個冬天', '那年，我也一個人過年'],
      /** Group 0 holds cards 0 and 1, group 1 holds cards 3 and 4; card 2 lies free. */
      groups: ['出走', '回家'],
      /** [from, to, label]: 0 → 1 後來, 2 → 1 因為, 4 → 3 呼應 (the resonance, drawn on the map). */
      arrows: [[0, 1, '後來'], [2, 1, '因為'], [4, 3, '呼應']],
    },
  },
  en: {
    me: { name: 'Ash', initials: 'AS' },
    them: { name: 'Summer', initials: 'SU' },
    writer: { name: 'June', initials: 'JU' },
    myCard: {
      title: 'My first trip alone',
      excerpt: 'At the station in Hualien I learned that getting lost can be its own kind of freedom. The sea was so blue…',
      tags: ['Travel', 'Courage', 'Growing up'],
      insight: 'Getting lost can be freedom',
      minutes: 4,
    },
    theirCard: {
      title: 'My first winter away from home',
      excerpt: 'The dorm heater broke. Wrapped in my coat, I made instant noodles and suddenly missed my mother’s soup…',
      tags: ['Home', 'Winter', 'Growing up'],
      minutes: 5,
    },
    resonanceCard: {
      title: 'I spent Lunar\u00a0New\u00a0Year alone too',
      excerpt: 'Reading about your winter, I remembered New Year’s Eve far from home: hot pot for one, a toast to a video call…',
      tags: ['Home', 'New Year'],
      minutes: 3,
    },
    writerCard: {
      title: '4 a.m. at the convenience store',
      excerpt: 'After a night shift I bought a hot milk tea. The clerk said, “Long night, huh?” It was the kindest thing I heard all day…',
      tags: ['Work', 'Late nights', 'Kindness'],
      minutes: 3,
    },
    note: 'Thank you for writing this — I worked nights for years, and that “long night” felt meant for me too',
    reply: 'Thanks for the note — I’m glad that kindness reached you too',
    map: {
      cards: ['My first trip alone', 'The day I quit', 'Drawing again', 'My first winter away from home', 'I spent Lunar\u00a0New\u00a0Year alone too'],
      groups: ['Leaving', 'Home'],
      arrows: [[0, 1, 'Later'], [2, 1, 'Because of'], [4, 3, 'Echoes']],
    },
  },
} as const;

export function copyFor(locale: Locale) {
  const ui = pick(locale === 'en' ? en : (zhTW as unknown as Messages));
  /** `ui`: the app's own strings; `narration`: the promo's lines; `stories`: the sample cards and people. */
  return { ui, narration: NARRATION[locale], stories: STORIES[locale] };
}

export type Copy = ReturnType<typeof copyFor>;

/** Fills `{name}` placeholders the way the app's messages are written. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}
