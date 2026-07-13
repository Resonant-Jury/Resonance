// The edit page loads the draft client-side (owner-scoped by Firestore
// rules), so its shell carries nothing per-request. Opting the dynamic
// segment into on-demand static generation lets the CDN cache the shell
// instead of paying a server render (and cold start) per navigation.
export function generateStaticParams(): { id: string }[] {
  return [];
}

export default function EditCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
