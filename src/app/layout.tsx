import './globals.css';
import AuthStatus from '@/components/AuthStatus';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Les Coureurs',
  description: 'A survival-horror RPG in an alternate 19th-century Europe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen">
        {/* Always visible on every page */}
        <AuthStatus />

        {/* Your app content */}
        {children}
      </body>
    </html>
  );
}
