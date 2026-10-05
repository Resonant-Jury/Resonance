import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';

const shortMd = `> A short one-line quote.`;

const imageMd = `A wide photo at its natural ratio:

![wide](https://picsum.photos/seed/res-wide/800/420)

A small photo — the frame should hug it, not stretch to the column:

![small](https://picsum.photos/seed/res-small/320/240)

![captioned](https://picsum.photos/seed/res-cap/700/380)
An image sharing its paragraph with this caption line.`;

const tallMd = `> This is a much taller blockquote rendered from markdown.
> It spans several lines so we can confirm the vertical curve
> grows more turns as the height increases, keeping the wobble
> density constant rather than stretching a fixed number of
> turns across the whole height. One more line for good measure.`;

// Links the pen's wave underlines: descenders, Chinese, one that wraps, one in a heading.
const linksMd = `Read about [typography, gauges and jiggly glyphs](https://example.com/typography) before the guide.

我讀了[這篇關於慢慢走路的文章](https://example.com/walk)之後，就決定週末去九份。

A long link that has to wrap: [the quietly sprawling guide to keeping a paper journal through every grey, rainy, sleepy Sunday morning](https://example.com/journal) and then some words after it.

## A heading with [a page we keep](https://example.com/heading)`;

export default function CurveCheck() {
  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: 24 }}>
      <h2>Short quote</h2>
      <StoryMarkdown source={shortMd} />

      <h2 style={{ marginTop: 40 }}>Tall quote</h2>
      <StoryMarkdown source={tallMd} />

      <h2 style={{ marginTop: 40 }}>Story links</h2>
      <div id="story-links-sample">
        <StoryMarkdown source={linksMd} />
      </div>

      <h2 style={{ marginTop: 40 }}>Story images</h2>
      <StoryMarkdown source={imageMd} />
    </div>
  );
}
