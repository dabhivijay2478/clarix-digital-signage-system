import type { Metadata, Viewport } from 'next';
import { PRODUCTION_DASHBOARD_CRITICAL_CSS } from '@/components/production-dashboard-critical-styles';
import { PLAYER_CRITICAL_CSS } from './player-critical-styles';
import PlayerThemeLock from './PlayerThemeLock';

export const metadata: Metadata = {
  title: 'MG Enterprise Player',
  description: 'Digital signage player for Samsung displays and offline controllers.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlayerThemeLock />
      <style dangerouslySetInnerHTML={{ __html: PLAYER_CRITICAL_CSS + PRODUCTION_DASHBOARD_CRITICAL_CSS }} />
      <div className="mg-player-shell">{children}</div>
    </>
  );
}
