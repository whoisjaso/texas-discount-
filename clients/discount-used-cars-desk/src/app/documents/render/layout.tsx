import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
};

// Minimal layout for PDF render route — no nav, no sidebar, just the document
export default function RenderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
