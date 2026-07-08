import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Truck Token Display',
  description: 'Live gate queue display for Samsung signage screens.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function TruckDisplayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
