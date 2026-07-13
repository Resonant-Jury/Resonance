// The thread page is fully client-rendered (auth + data via Firestore), so
// its shell carries nothing per-request. Opting the dynamic segment into
// on-demand static generation lets the CDN cache the shell instead of paying
// a server render (and cold start) on every first navigation.
export function generateStaticParams(): { handle: string }[] {
  return [];
}

export default function MessageThreadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
