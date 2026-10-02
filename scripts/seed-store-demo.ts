/**
 * The store screenshot world: a curated, believable zh-TW demo in the LOCAL
 * Firebase emulators, for the App Store / Play screenshots
 * (`npm run emulators`, then `npx tsx scripts/seed-store-demo.ts`).
 *
 * It first CLEARS both emulators (Auth and Firestore, project demo-resonance),
 * so it replaces whatever the test world held; `npx tsx scripts/seed-emulator.ts`
 * restores that one. Nothing here can reach production: the project id is a
 * `demo-` one and every request goes to 127.0.0.1.
 *
 * The viewer is 小滿 (demo@resonance.test, the same local test password as
 * seed-emulator.ts). Around her: six writers, a dozen of their cards, response
 * cards (a resonance is a card that points at another with referenceCardId),
 * two connections and one conversation, her thought map, a draft and a few
 * bell rows. A card carries an illustration when
 * docs/store/graphics/demo-media/<cardId>.jpg exists (made by
 * store-demo-illustrations.ts); it goes in as a data: URI, which both native
 * apps' image loaders accept, so no image server is needed. Without the file the
 * card has no media and the apps draw their striped placeholder.
 *
 * The data below is exported and main() runs only when this file is executed
 * directly, so other scripts can read the card list without seeding anything.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

/** The seed accounts' local password, read from seed-emulator.ts (importing that script would run it). */
function seedPassword(): string {
  const src = readFileSync(resolve(process.cwd(), 'scripts/seed-emulator.ts'), 'utf8');
  const found = src.match(/^export const SEED_PASSWORD = '(.*)';/m);
  if (!found) throw new Error('SEED_PASSWORD not found in scripts/seed-emulator.ts');
  return found[1];
}

export const DEMO_EMAIL = 'demo@resonance.test';
export const DEMO_HANDLE = '小滿';

export interface Writer {
  uid: string;
  handle: string;
  bio: string;
  region: string;
  accent: string;
  joinedDaysAgo: number;
}

export const VIEWER: Writer = {
  uid: 'xiaoman',
  handle: DEMO_HANDLE,
  bio: '在台北租屋的第三年，寫日常裡的小事',
  region: 'TW',
  accent: 'oklch(89% 0.07 165)',
  joinedDaysAgo: 120,
};

export const WRITERS: Writer[] = [
  { uid: 'acheng', handle: '阿澄', bio: '台南長大，喜歡煮飯，也喜歡記得', region: 'TW', accent: 'oklch(88% 0.08 55)', joinedDaysAgo: 210 },
  { uid: 'weiyu', handle: '微雨', bio: '喜歡下雨天，和安靜的咖啡店', region: 'TW', accent: 'oklch(90% 0.05 290)', joinedDaysAgo: 180 },
  { uid: 'alan', handle: '阿嵐', bio: '寫家人，寫那些沒說出口的話', region: 'TW', accent: 'oklch(90% 0.07 88)', joinedDaysAgo: 150 },
  { uid: 'muzi', handle: '木子', bio: '離職中，慢慢找回自己的節奏', region: 'TW', accent: 'oklch(90% 0.06 140)', joinedDaysAgo: 95 },
  { uid: 'haiyan', handle: '海鹽', bio: '夜班人，收集城市的深夜片段', region: 'HK', accent: 'oklch(90% 0.05 215)', joinedDaysAgo: 75 },
  { uid: 'shiguang', handle: '拾光', bio: '旅居京都，用中文寫日文的日常', region: 'JP', accent: 'oklch(89% 0.07 18)', joinedDaysAgo: 60 },
];

export interface CardSpec {
  id: string;
  author: string;
  title: string;
  paragraphs: string[];
  tags: string[];
  hue: number;
  /** Minutes ago it was published. */
  ago: number;
  reads: number;
  /** The card this one responds to (a resonance). */
  ref?: string;
}

export const CARDS: CardSpec[] = [
  // ---- the freshest cards: what the feed opens on ----
  {
    id: 'two-am-convenience-store',
    author: 'haiyan',
    title: '凌晨兩點的便利商店',
    hue: 290,
    ago: 18,
    reads: 97,
    tags: ['夜晚', '城市', '陌生人'],
    paragraphs: [
      '凌晨兩點，我走進巷口那間便利商店，只是想買一瓶水。日光燈亮得像白天，冷氣涼涼的，關東煮的湯在角落安靜地冒著煙。',
      '櫃檯後面的店員正在補貨，他抬頭看我一眼，說了一聲「歡迎光臨」。語氣不熱情，也不敷衍，剛剛好，像是對一個熟悉的人。',
      '我在飲料櫃前站了很久。其實我不渴，我只是不想回到那個安靜的房間。',
      '結帳的時候，他把零錢放進我手心，忽然說：「今天很晚喔，早點休息。」就這麼一句。走出店門，夜風吹過來，我覺得胸口有一個地方，被輕輕地按了一下。',
      '原來被陌生人惦記一句，也可以是一整夜的光。',
    ],
  },
  {
    id: 'first-morning-after-quitting',
    author: 'muzi',
    title: '離職後的第一個早晨',
    hue: 88,
    ago: 75,
    reads: 312,
    tags: ['工作', '自己', '日常'],
    paragraphs: [
      '鬧鐘沒有響。我睜開眼睛，窗簾縫裡的光已經爬到牆的一半，那是我很久沒有在平日看過的位置。',
      '我躺著，聽樓下的阿姨拖著菜籃車經過，輪子壓過磁磚縫的聲音，一格一格，很規律。原來早上九點的世界，是這個聲音。',
      '前一天，我把工作證放進抽屜的時候，手其實有點抖。七年，我把自己縮成一個職稱、一個分機號碼，和一封又一封「麻煩您」開頭的信。現在那個人不在了，我站在廚房，突然不確定該用哪個杯子。',
      '我煮了一壺水，慢慢泡了一杯茶，坐在窗邊喝完。沒有人傳訊息來，沒有會議要開。安靜得有點可怕，卻也有點好。',
      '我還不知道接下來要做什麼。但今天早上，我第一次覺得，這一天是屬於我的。',
    ],
  },
  {
    id: 'the-day-i-moved-out',
    author: 'shiguang',
    title: '搬離家的那天',
    hue: 18,
    ago: 170,
    reads: 528,
    tags: ['搬家', '成長', '家人'],
    paragraphs: [
      '搬家那天，天氣好得有點不近人情。太陽亮亮的，像是故意在提醒我，這不是一個適合難過的日子。',
      '爸爸一句話也沒說，把最後一個紙箱扛上貨車，又把繩子多綁了兩次。媽媽在門口塞給我一袋水果，說路上吃，然後轉身進了屋，說要去關瓦斯。我知道瓦斯早就關好了。',
      '貨車開動的時候，我從後照鏡裡看見他們兩個站在巷口。他們沒有揮手，只是站著，越來越小，直到轉彎的時候，被一面牆擋住。',
      '到了新的房間，我坐在地板上，打開那袋水果。每一顆都洗過了，擦乾了，還用衛生紙一顆一顆包好。我坐在滿是紙箱的房間裡，吃了一顆橘子，很酸，但我吃完了整顆。',
      '那天晚上，我傳訊息給媽媽：橘子很甜。她回：那就好。',
    ],
  },
  {
    id: 'fathers-old-bicycle',
    author: 'alan',
    title: '父親的舊腳踏車',
    hue: 215,
    ago: 340,
    reads: 701,
    tags: ['家人', '回憶', '成長'],
    paragraphs: [
      '車庫的角落，一直靠著一輛藍色的腳踏車。車鏈生了鏽，坐墊的皮裂了一道縫，父親用透明膠帶纏了又纏，說還能騎。',
      '小時候，週末的早晨，他會把我抱上後座，騎過兩條街，去市場買豆漿和蔥油餅。我的手抓著他襯衫的下擺，那件襯衫洗過很多次，有肥皂和太陽混在一起的味道。',
      '我一直以為他騎得很快。長大以後才知道，他其實騎得很慢，因為怕我掉下去。',
      '上個月回家，我把腳踏車牽出來，打了氣，換了新的坐墊。父親站在旁邊看，手插在口袋裡，說：「不用啦，那麼舊了。」可是他的眼睛，一直跟著那個新坐墊。',
      '我騎了一小段，沿著小時候那條路。這一次，換我騎得很慢，因為後座是空的，卻好像有人，正抓著我的衣角。',
    ],
  },
  {
    id: 'mint-on-the-balcony',
    author: 'weiyu',
    title: '陽台上的薄荷',
    hue: 140,
    ago: 610,
    reads: 246,
    tags: ['日常', '植物', '療癒'],
    paragraphs: [
      '搬進新家的第一個週末，我在陽台放了一盆薄荷。花市的老闆說，這種草很好養，只要給它光和水，其他的它自己會想辦法。',
      '我笑了，覺得這句話像是在說我。',
      '每天早上出門前，我會摸一下它的葉子，讓那股涼涼的香味留在手指上。那個味道很像剛下過雨的早晨，也像某個人剛洗完頭髮，從身邊走過。',
      '這個月我加班很多，有一天回到家已經十一點，一抬頭，發現薄荷長高了一截，葉子朝著屋內的燈探出來。原來，就算沒有人特別照顧，它也還是很認真地長。',
      '那天晚上，我泡了一杯薄荷茶。喝下去的時候，我忽然覺得，被一株植物這樣安靜地陪著，其實已經夠了。',
    ],
  },

  // ---- 祖母的廚房 and the resonances it drew ----
  {
    id: 'grandmas-kitchen',
    author: 'acheng',
    title: '祖母的廚房',
    hue: 55,
    ago: 2000,
    reads: 864,
    tags: ['家人', '料理', '回憶'],
    paragraphs: [
      '祖母的廚房很小，小到兩個人同時轉身就會撞到彼此。瓦斯爐邊的牆壁被油煙薰成淡淡的琥珀色，我小時候一直以為，那是時間本來的顏色。',
      '放學回家，我把書包丟在門口，聞到味道就知道今天煮什麼。醬油和冰糖在鍋裡慢慢化開，是滷肉；蔥爆進油裡的聲音，是要煎蛋了。她從來不看食譜，也沒有量匙，「差不多」是她唯一的單位。',
      '我問她，差不多是多少？她把湯匙舀起來，對著光看了看，說：「就是你吃了會笑的那個多。」',
      '後來我離開家，在外面吃過很多昂貴的餐廳，卻再也沒有一碗飯，能讓我這樣毫無防備地吃下去。她總說再一碗，湯還很多；我那時候只覺得吵，現在才明白，那是她會的、最溫柔的話。',
      '上個月，我終於在自己的小廚房裡，照著記憶煮了一鍋滷肉。味道不對，太甜了。但我把鍋蓋掀開的那一秒，蒸氣撲到臉上，我忽然覺得，她就站在旁邊，笑著說：差不多了。',
    ],
  },
  {
    id: 'rice-cooker-is-waiting-too',
    author: 'xiaoman',
    title: '外婆的電鍋，也在等我',
    hue: 55,
    ago: 1700,
    reads: 176,
    ref: 'grandmas-kitchen',
    tags: ['回應', '家人'],
    paragraphs: [
      '讀你寫祖母的廚房，我一直想起外婆家那個老電鍋。米白色的，外鍋永遠有一圈洗不掉的水痕，開關按下去會發出很重的「喀」一聲。',
      '她也不看食譜。我問她菜怎麼煮，她說：「電鍋跳起來就好了。」那時候我覺得敷衍，現在才知道，那是她全部的耐心。',
      '謝謝你，讓我想起那一聲「喀」。',
    ],
  },
  {
    id: 'first-lamp-in-my-rental',
    author: 'xiaoman',
    title: '租屋處的第一盞燈',
    hue: 88,
    ago: 1500,
    reads: 402,
    tags: ['搬家', '日常', '自己'],
    paragraphs: [
      '搬進租屋處的那晚，我發現天花板的燈壞了。房東明天才有空來修，我只好在黑暗裡摸索，把行李箱一個一個推進房間。',
      '後來，我從背包裡翻出一盞在夜市買的小檯燈，插上插座，橘黃色的光一下子從桌角漫開來，照亮了一小圈地板、半張桌子，和我放在上面的那杯水。',
      '那一小圈光，好小，卻剛好夠我坐下。我在光裡吃完了一個涼掉的便當，第一次覺得，這個十坪的房間，也許會慢慢變成我的家。',
      '現在想起來，我記得的不是壞掉的燈，而是那一圈光。原來一個地方，是從你為它點亮的第一盞燈開始，才真正屬於你。',
    ],
  },
  {
    id: 'a-pot-of-soup-time',
    author: 'weiyu',
    title: '一鍋湯的時間',
    hue: 215,
    ago: 1250,
    reads: 120,
    ref: 'grandmas-kitchen',
    tags: ['回應', '料理'],
    paragraphs: [
      '你說「差不多」是她唯一的單位，我讀到這裡笑了出來，又有點想哭。',
      '我阿嬤也是。她煮的湯從來沒有一次一樣過，但每一碗，都剛好是我當時需要的味道。',
    ],
  },
  {
    id: 'that-lamp-reaches-me-too',
    author: 'weiyu',
    title: '那盞燈，也照到我這裡',
    hue: 290,
    ago: 1000,
    reads: 143,
    ref: 'first-lamp-in-my-rental',
    tags: ['回應', '搬家'],
    paragraphs: [
      '我搬家的時候，也遇過一模一樣的夜晚：燈壞了，行李還在門口，整個房間陌生得像別人的。',
      '讀完你的卡片，我把自己的小檯燈也打開了。橘黃的光一漫開來，好像有人在很遠的地方，對我說：歡迎回來。',
    ],
  },
  {
    id: 'soy-sauce-and-rock-sugar',
    author: 'alan',
    title: '醬油與冰糖',
    hue: 88,
    ago: 900,
    reads: 98,
    ref: 'grandmas-kitchen',
    tags: ['回應', '家人'],
    paragraphs: [
      '讀到醬油和冰糖在鍋裡慢慢化開，我才發現，我記得的不是奶奶說過的話，而是她煮飯的背影。',
      '那個背影很小，卻好像撐著整個家。',
    ],
  },
  {
    id: 'light-of-a-new-home',
    author: 'acheng',
    title: '新家的光',
    hue: 55,
    ago: 800,
    reads: 87,
    ref: 'first-lamp-in-my-rental',
    tags: ['回應', '日常'],
    paragraphs: [
      '「一個地方，是從你為它點亮的第一盞燈開始，才真正屬於你。」這句話，我想抄在便條紙上，貼在冰箱門。',
      '謝謝你寫下它。',
    ],
  },

  // ---- older cards ----
  {
    id: 'day-three-of-a-solo-trip',
    author: 'haiyan',
    title: '一個人的旅行，第三天',
    hue: 215,
    ago: 3300,
    reads: 410,
    tags: ['旅行', '自己', '海'],
    paragraphs: [
      '旅行的第三天，我終於習慣了一個人吃飯。不再假裝看手機，不再急著吃完，只是把一碗麵慢慢吃到湯見底。',
      '在小鎮的海邊，我坐了一整個下午。潮水退了又來，像是在對我說，不急，不急。旁邊有一對老夫妻，撐著同一把遮陽傘，不說話，卻好像已經把所有的話都說完了。',
      '我以前總以為，旅行是為了看見新的風景。現在才知道，有時候，是為了讓自己聽見自己的聲音。',
      '回程的車票，我把它折成一隻小小的紙船，放進外套口袋。它不會漂走，但我知道，我已經帶著一點海，回家了。',
    ],
  },
  {
    id: 'walk-slower-in-the-rain',
    author: 'weiyu',
    title: '下雨天，走慢一點',
    hue: 215,
    ago: 4000,
    reads: 388,
    tags: ['散步', '雨天', '日常'],
    paragraphs: [
      '我一直喜歡下雨天。不是喜歡濕漉漉的鞋，而是喜歡整個城市被調小了音量，車聲、人聲都變得圓圓的，像隔著一層棉被。',
      '今天下班，沒有撐傘就走向捷運站，是因為傘忘在辦公室。雨不大，落在頭髮上涼涼的，走著走著，我竟然放慢了腳步。',
      '路過一家麵包店，玻璃窗起了霧，店員在裡面把剛出爐的吐司一條一條排好。我站在騎樓下看了很久，看到自己的呼吸也在玻璃上起了霧。',
      '回到家，我把濕掉的外套掛起來，水滴一顆一顆落在地板上，像一首很慢的歌。有時候，人也需要這樣，被雨打亂一點節奏，才會想起，原來自己可以走慢一點。',
    ],
  },
  {
    id: 'slow-steps-in-the-rain-too',
    author: 'xiaoman',
    title: '我也想在雨裡走慢一點',
    hue: 215,
    ago: 3500,
    reads: 166,
    ref: 'walk-slower-in-the-rain',
    tags: ['回應', '散步'],
    paragraphs: [
      '你寫「城市被調小了音量」，我讀的時候，剛好窗外也下著雨。',
      '我把窗戶打開一條縫，聽雨落在對面屋簷的鐵皮上，滴滴答答，像有人在很認真地打字。',
      '今天，我也決定走慢一點。',
    ],
  },
  {
    id: 'hotpot-for-one',
    author: 'xiaoman',
    title: '一個人吃火鍋的晚上',
    hue: 55,
    ago: 4500,
    reads: 356,
    tags: ['日常', '自己', '料理'],
    paragraphs: [
      '朋友臨時取消了約，我站在火鍋店門口，猶豫了三秒，還是走了進去。「一位。」我說。服務生沒有多看我一眼，只是自然地帶我到窗邊的小桌。',
      '一個人的火鍋很安靜。湯滾了，我夾起一片玉米，一片豆腐，一片高麗菜，把它們排在碗裡，像在排一幅小小的畫。',
      '我以前總覺得，一個人吃飯是一件需要理由的事。但那個晚上，蒸氣糊了眼鏡，我忽然覺得，我不需要向任何人解釋。',
      '結帳的時候，服務生說：「謝謝你今天選我們。」我笑著點頭。原來，好好對待自己，也是一種被款待。',
    ],
  },
  {
    id: 'first-pay-envelope',
    author: 'muzi',
    title: '第一份工作的薪水袋',
    hue: 140,
    ago: 5200,
    reads: 455,
    tags: ['工作', '回憶', '成長'],
    paragraphs: [
      '第一份工作，領的是現金。月底的下午，主任把一個牛皮紙袋放在我桌上，上面用原子筆寫著我的名字，寫得歪歪的。',
      '我不敢當場打開，一直到下班，坐在公車最後一排，才把袋子拆開一個小角。兩萬二，一張一張，我數了三遍。',
      '那個月我請爸媽吃了一頓飯，點了菜單上最貴的那道魚。爸爸說太浪費，卻夾了最大塊的魚肚放進我碗裡。',
      '那個牛皮紙袋，我到現在還留著，收在書桌最下面的抽屜。裡面已經沒有錢了，只剩下一種，我怎麼也花不掉的東西。',
    ],
  },
  {
    id: 'the-43rd-minute',
    author: 'xiaoman',
    title: '通勤的第四十三分鐘',
    hue: 290,
    ago: 7000,
    reads: 521,
    tags: ['城市', '日常', '通勤'],
    paragraphs: [
      '我每天通勤四十三分鐘，從板橋到信義。早上的捷運像一條密實的河，我們都是被水推著走的石子。',
      '第四十三分鐘，是我走出車站的那一刻。陽光從出口斜斜地切進來，不管前一晚睡得好不好，那一刻我都會停半秒，深呼吸。',
      '有一天，我發現對面座位的女孩在看一本很舊的詩集，書頁泛黃，她讀到某一頁，嘴角微微地彎起來。我忽然覺得，這座擁擠的城市裡，每個人都帶著一個不吵人的宇宙。',
      '那天，我也把手機收進包包裡。第四十三分鐘到了，我走出車站，覺得今天好像會不錯。',
    ],
  },
  {
    id: 'back-row-of-cram-school',
    author: 'alan',
    title: '補習班的最後一排',
    hue: 88,
    ago: 8000,
    reads: 233,
    tags: ['成長', '青春', '回憶'],
    paragraphs: [
      '高三那年，我總是坐在補習班的最後一排，靠窗的位置。那裡看得見對面大樓的燈，一盞一盞，亮到很晚。',
      '我常常在想，那些亮著的窗戶後面，是不是也有人跟我一樣，在寫著永遠寫不完的考卷。這樣想，就沒有那麼孤單。',
      '有一次下課，下起暴雨。同學都走光了，我站在騎樓，一個不熟的女生把傘遞給我，說：「我家很近，你先用。」她說完就跑進雨裡，我連她的名字都沒問到。',
      '這麼多年過去，我早就不記得那年的考題，卻一直記得那把傘，是淺藍色的，傘骨有一根微微彎著。',
    ],
  },
  {
    id: 'night-train-home',
    author: 'acheng',
    title: '回鄉的夜車',
    hue: 290,
    ago: 9500,
    reads: 305,
    tags: ['旅途', '家人', '夜晚'],
    paragraphs: [
      '週五晚上的夜車，總是擠滿了要回家的人。我靠窗坐著，看窗外的燈一盞一盞往後退，像時間也在往回走。',
      '隔壁的阿伯，提著一大袋還冒著熱氣的肉粽，上車前特地抱在胸口，怕被人擠壞。他說，是要帶給孫子的。',
      '我忽然想起，我也該打一通電話。撥出去，響了兩聲，媽媽就接起來，她說：「你到哪裡了？我把飯菜都溫著。」',
      '車繼續往南開。窗外一片黑，但我知道，前方有一盞燈，是為我留的。',
    ],
  },
  {
    id: 'mothers-phone-call',
    author: 'xiaoman',
    title: '母親打來的電話',
    hue: 18,
    ago: 10500,
    reads: 288,
    tags: ['家人', '日常', '想念'],
    paragraphs: [
      '母親很少打電話給我。她怕我在忙，怕吵到我，所以多半只傳貼圖，一隻小熊拿著花，一隻小貓比愛心。',
      '昨晚十點，手機響了。我一看是「媽媽」，心裡咯噔一下，接起來，那頭卻只說：「沒事，就是看你有沒有吃飯。」',
      '我說吃了，其實只吃了一包餅乾。她說，那就好，你要顧好自己。然後我們沉默了一下，我聽見電話那頭，電視正在播一齣很吵的鄉土劇。',
      '那一分鐘的沉默，我一直記得。有些愛不需要話語，只需要有一個人在另一頭，安靜地陪著你。',
    ],
  },
  {
    id: 'first-winter-abroad',
    author: 'shiguang',
    title: '異鄉的第一個冬天',
    hue: 215,
    ago: 12000,
    reads: 190,
    tags: ['異鄉', '冬天', '自己'],
    paragraphs: [
      '來到這座城市的第一個冬天，我學會了很多事：怎麼分類垃圾，怎麼在雪天走路不滑倒，怎麼在便利商店，用不太標準的日文，買一個熱的飯糰。',
      '最難的是傍晚。天黑得很早，四點多，窗外就只剩下路燈。我坐在小小的房間裡，聽著暖氣的聲音，忽然很想念家裡那盞昏黃的燈。',
      '有一天，房東太太敲門，遞給我一碗熱湯，說：「太冷了，你一個人，要多吃點。」我用破碎的日文說謝謝，她笑著揮手。',
      '那碗湯，我喝得很慢。原來語言不通的地方，溫暖也是通的。',
    ],
  },
  {
    id: 'sunday-market',
    author: 'xiaoman',
    title: '週日早晨的市場',
    hue: 140,
    ago: 14000,
    reads: 199,
    tags: ['日常', '回憶', '散步'],
    paragraphs: [
      '週日早上，我會走去附近的傳統市場。攤位一個接一個，魚販的水聲、菜販的吆喝，和剛炸好的蔥油餅的香氣，全部混在一起，是我最喜歡的熱鬧。',
      '我常去的那個賣菜阿姨，記得我不吃香菜。她總是把蔥抓得特別多，塞進我的袋子裡，說：「今天送你的。」',
      '那天我忽然覺得，被記得，是這座城市最小、也最大的溫柔。',
    ],
  },
];

/** The viewer's own unfinished card, for the Write screen. */
export const DRAFT = {
  id: 'draft-the-night-of-the-blackout',
  title: '停電的那一晚',
  story: [
    '晚上九點，整棟樓忽然安靜了。冰箱不再嗡嗡作響，電腦的螢幕黑了下來，連隔壁一直開著的電視，也沒了聲音。',
    '我摸黑找到抽屜裡的蠟燭，點起來，火光晃了一下，把牆上的影子拉得好長。那一刻我才發現，原來這間我住了三年的房間，在燭光裡，比平常更像家。',
  ],
  ago: 15,
};

/** Where the generated illustrations live: one <cardId>.jpg per card (see store-demo-illustrations.ts). */
export const DEMO_MEDIA_DIR = 'docs/store/graphics/demo-media';

/** A card doc may not pass 1 MiB in Firestore; stay well under it (the base64 is a third larger than the file). */
const MAX_IMAGE_BYTES = 600_000;

/**
 * The card's illustration as a data: URI, or null when it has none. A file over
 * the budget is re-encoded smaller with sips (macOS) rather than failing the seed.
 */
export function demoMediaDataUri(cardId: string): string | null {
  const file = resolve(process.cwd(), DEMO_MEDIA_DIR, `${cardId}.jpg`);
  if (!existsSync(file)) return null;
  let bytes = readFileSync(file);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    const dir = mkdtempSync(join(tmpdir(), 'demo-media-'));
    try {
      for (const [width, quality] of [[640, 75], [512, 70], [384, 65]] as const) {
        const out = join(dir, `${cardId}.jpg`);
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '--resampleWidth', String(width), file, '--out', out], { stdio: 'ignore' });
        bytes = readFileSync(out);
        if (bytes.byteLength <= MAX_IMAGE_BYTES) break;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`${cardId}.jpg is still ${bytes.byteLength} bytes after shrinking`);
  }
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

const now = Date.now();

async function clearEmulators() {
  const targets = [
    `http://127.0.0.1:8080/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`,
  ];
  for (const url of targets) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Clearing ${url} failed: ${res.status}`);
  }
}

async function main() {
  Object.assign(process.env, emulatorEnv);
  const password = seedPassword();
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

  await clearEmulators();

  const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'store-demo');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const at = (minutesAgo: number) => Timestamp.fromMillis(now - minutesAgo * 60_000);

  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const put = (path: string, data: Record<string, unknown>) => writes.push({ path, data });

  // ---- people ----
  for (const u of [VIEWER, ...WRITERS]) {
    const isViewer = u.uid === VIEWER.uid;
    await auth.createUser({
      uid: u.uid,
      email: isViewer ? DEMO_EMAIL : `${u.uid}@resonance.test`,
      password,
      emailVerified: true,
    });
    put(`users/${u.uid}`, {
      handle: u.handle,
      handleLower: u.handle.toLowerCase(),
      bio: u.bio,
      region: u.region,
      primaryLocale: 'zh-TW',
      autoTranslateTo: ['en'],
      verified: true,
      phoneHash: '',
      avatarSeed: String([...u.uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)),
      initials: u.handle.slice(0, 2).toUpperCase(),
      accentColor: u.accent,
      joinedAt: at(60 * 24 * u.joinedDaysAgo),
      handleChangedAt: at(60 * 24 * u.joinedDaysAgo),
      // The just-in-time hints stay out of the screenshots (lib/hints.ts: three displays and they are gone).
      ...(isViewer ? { hintsSeen: { 'anonymous-publish': 3, 'note-privacy': 3, 'feed-reason': 3 } } : {}),
    });
    // The pen name's reservation, as the profile writes keep it (lib/db/firestore/handles).
    put(`handles/${u.handle.toLowerCase()}`, { uid: u.uid, handle: u.handle });
  }

  // ---- cards (a resonance is a card whose referenceCardId names another) ----
  const resonanceCounts = new Map<string, number>();
  for (const c of CARDS) if (c.ref) resonanceCounts.set(c.ref, (resonanceCounts.get(c.ref) ?? 0) + 1);
  const known = new Set(CARDS.map((c) => c.id));
  let illustrated = 0;
  for (const c of CARDS) {
    if (c.ref && !known.has(c.ref)) throw new Error(`${c.id} responds to an unknown card ${c.ref}`);
    const image = demoMediaDataUri(c.id);
    if (image) illustrated++;
    put(`cards/${c.id}`, {
      authorId: c.author,
      slug: c.id,
      thoughtCore: c.title,
      story: c.paragraphs.join('\n\n'),
      tags: c.tags,
      originalLocale: 'zh-TW',
      translations: {},
      visibility: 'public',
      publishedAt: at(c.ago),
      updatedAt: at(c.ago),
      readCount: c.reads,
      resonanceCount: resonanceCounts.get(c.id) ?? 0,
      inviteCount: 0,
      accentHue: c.hue,
      anonymous: false,
      ...(c.ref ? { referenceCardId: c.ref } : {}),
      ...(image ? { media: { type: 'image', url: image, label: c.title } } : {}),
    });
  }

  // The viewer's draft: a title and two paragraphs, not yet published.
  put(`cards/${DRAFT.id}`, {
    authorId: VIEWER.uid,
    thoughtCore: DRAFT.title,
    story: DRAFT.story.join('\n\n'),
    tags: [],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: null,
    updatedAt: at(DRAFT.ago),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: false,
  });

  // A card of 海鹽's that links to one of hers (the bell's card_link, and her card box's "linked" shelf).
  put('cardLinks/day-three-of-a-solo-trip_the-43rd-minute', {
    sourceCardId: 'day-three-of-a-solo-trip',
    sourceAuthorId: 'haiyan',
    targetCardId: 'the-43rd-minute',
    targetAuthorId: VIEWER.uid,
    createdAt: at(120),
  });

  // ---- connections: whoever resonated with whom is connected (connectResonance in lib/api/v1/publish.ts) ----
  const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
  const connectedAt = new Map<string, number>();
  for (const c of CARDS) {
    if (!c.ref) continue;
    const other = CARDS.find((x) => x.id === c.ref)!.author;
    const [a, b] = pair(c.author, other);
    const id = `${a}_${b}`;
    connectedAt.set(id, Math.max(connectedAt.get(id) ?? 0, c.ago));
  }
  for (const [id, ago] of connectedAt) {
    put(`connections/${id}`, { userIds: id.split('_'), establishedAt: at(ago) });
  }

  // ---- the conversation with 阿澄 about 「祖母的廚房」 ----
  const CONVO = 'acheng_xiaoman';
  const messages: Array<{ from: string; text: string; ago: number; cardRef?: string }> = [
    { from: 'acheng', ago: 1480, text: '讀到你回應「祖母的廚房」的那張卡片，我在捷運上差點哭出來' },
    { from: 'xiaoman', ago: 1450, text: '我才要謝謝你，「差不多」那三個字，我讀了好幾遍' },
    { from: 'acheng', ago: 1420, text: '你寫電鍋跳起來的那一聲「喀」，我整個人都回到小時候了' },
    { from: 'xiaoman', ago: 1400, text: '對呀，到現在聽到那一聲，還是會覺得很安心' },
    { from: 'xiaoman', ago: 1395, cardRef: 'mothers-phone-call', text: '我前陣子也寫過一篇媽媽的電話，覺得跟你的廚房是同一種安心' },
    { from: 'acheng', ago: 300, text: '剛剛讀完了，那一分鐘的沉默，我也懂' },
    { from: 'acheng', ago: 25, text: '下次回台南，我想再煮一次滷肉，這次少放一點冰糖。寫好了，我第一個傳給你' },
  ];
  const last = messages[messages.length - 1];
  put(`conversations/${CONVO}`, {
    participants: [...pair('acheng', VIEWER.uid)],
    createdAt: at(1480),
    updatedAt: at(last.ago),
    lastMessage: { text: last.text, senderId: last.from, sentAt: at(last.ago) },
    unread: { acheng: 0, xiaoman: messages.filter((m) => m.from === 'acheng' && m.ago < 1395).length },
    originCardId: 'grandmas-kitchen',
  });
  messages.forEach((m, i) => {
    put(`conversations/${CONVO}/messages/m${i + 1}`, {
      senderId: m.from,
      text: m.text,
      sentAt: at(m.ago),
      ...(m.cardRef ? { cardRef: m.cardRef } : {}),
    });
  });

  // ---- the bell (three unread, one read) ----
  const notify = (id: string, type: string, payload: Record<string, unknown>, ago: number, read = false) =>
    put(`notifications/${id}`, { userId: VIEWER.uid, type, payload, readAt: read ? at(ago - 30) : null, createdAt: at(ago) });
  notify('n-card-link', 'card_link', { fromUserId: 'haiyan', fromHandle: '海鹽', sourceCardId: 'day-three-of-a-solo-trip', cardId: 'the-43rd-minute' }, 120);
  notify('n-resonance-acheng', 'resonance', { fromUserId: 'acheng', fromHandle: '阿澄', cardId: 'first-lamp-in-my-rental' }, 800);
  notify('n-resonance-weiyu', 'resonance', { fromUserId: 'weiyu', fromHandle: '微雨', cardId: 'first-lamp-in-my-rental' }, 1000);
  notify('n-message-acheng', 'message', { fromUserId: 'acheng', fromHandle: '阿澄' }, 1480, true);

  // ---- her thought map: two labelled zones, six of her cards, three labelled arrows ----
  // (Nodes are 232 x 178; a zone's header sits 70 above its first row, as in seed-emulator.ts.)
  const map = `thoughtMaps/${VIEWER.uid}`;
  put(`${map}/groups/g-alone`, { title: '獨自生活', hue: 88, x: -40, y: -70, w: 560, h: 514, createdAt: at(60) });
  put(`${map}/groups/g-remembered`, { title: '被記得的溫柔', hue: 55, x: -40, y: 530, w: 560, h: 514, createdAt: at(60) });
  const node = (cardId: string, x: number, y: number, groupId: string) =>
    put(`${map}/nodes/${cardId}`, { cardId, x, y, groupId, createdAt: at(60), updatedAt: at(60) });
  node('first-lamp-in-my-rental', 0, 0, 'g-alone');
  node('hotpot-for-one', 272, 20, 'g-alone');
  node('the-43rd-minute', 136, 226, 'g-alone');
  node('mothers-phone-call', 0, 600, 'g-remembered');
  node('rice-cooker-is-waiting-too', 272, 620, 'g-remembered');
  node('sunday-market', 136, 826, 'g-remembered');
  const edge = (source: string, target: string, label: string) =>
    put(`${map}/edges/${source}_${target}`, { sourceCardId: source, targetCardId: target, label, createdAt: at(60) });
  edge('first-lamp-in-my-rental', 'hotpot-for-one', '後來');
  edge('the-43rd-minute', 'mothers-phone-call', '想念');
  edge('mothers-phone-call', 'rice-cooker-is-waiting-too', '延伸');

  // ---- write it all ----
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) batch.set(db.doc(w.path), w.data);
    await batch.commit();
  }

  const published = CARDS.length;
  console.log(
    `Store demo seeded into ${EMULATOR_PROJECT_ID}: ${WRITERS.length + 1} people, ${published} published cards ` +
      `(${CARDS.filter((c) => c.ref).length} resonances, ${illustrated} illustrated), 1 draft, ${connectedAt.size} connections, 1 conversation.`,
  );
  console.log(`Viewer: ${DEMO_EMAIL} / handle ${DEMO_HANDLE}. Draft: /write/${DRAFT.id}`);
}

// Seed only when run directly (tsx scripts/seed-store-demo.ts), not when another script imports the data.
if (process.argv[1] && /seed-store-demo\.[cm]?[tj]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
