# Security policy

Resonance holds personal writing: stories, anonymous cards, private notes and messages. We take
reports of anything that could expose them seriously, and we're grateful for them.

## Reporting a vulnerability

**Email support@resonance.channel**, with "Security" in the subject. Please **don't** open a public
issue, pull request or discussion about a vulnerability before it is fixed.

Include what you can of:

- what the problem is and what someone could do with it;
- where it is: a URL or API route, or which app and its version;
- the steps to reproduce it, and a proof of concept if you have one;
- whether you think it is being used against people now.

## What happens next

- We'll reply to confirm we have your report, usually within a few days, and keep you posted while
  we work on it.
- We fix confirmed problems as fast as their severity calls for, and tell you when the fix is out.
- If you'd like, we'll thank you by name when the fix is released.

## Testing in good faith

- Test against your own accounts, or run the whole stack locally against the Firebase emulators
  (see the [README](README.md#getting-started)). Never read, change or keep other people's data
  beyond the minimum needed to show the problem, and tell us if you did see any.
- No denial-of-service, spam, social engineering, or attacks on our providers (Vercel, Firebase,
  Cloudflare, OpenAI). Report problems in their services to them.
- Give us a reasonable time to fix a problem before you talk about it publicly.

We won't pursue anyone who follows these rules.

## In scope

- the website and its API: `resonance.channel` (and the former host `resonance-world.vercel.app`);
- the iOS and Android apps, current versions from the App Store and Google Play;
- the code in this repository, including the Firestore security rules (`firebase/firestore.rules`).

Abuse of the service itself (a harmful card, a person harassing you) isn't a security issue: report
it in the app, or write to support@resonance.channel.
