'use client';
 
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePeers } from '../hooks/usePeers';
import { APP_VERSION } from '../lib/constants';
import { 
  LayoutDashboard, 
  Monitor, 
  PlaySquare, 
  BarChart3, 
  Settings, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
 
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/screens', label: 'Screens', icon: Monitor },
  { href: '/content', label: 'Content', icon: PlaySquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];
 
interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}
 
export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { peerCount } = usePeers();
 
  const [appName, setAppName] = useState('SignalOS');
  const [appIcon, setAppIcon] = useState<string | null>(null);
 
  useEffect(() => {
    const loadBranding = () => {
      setAppName(localStorage.getItem('signalos_custom_app_name') || 'SignalOS');
      setAppIcon(localStorage.getItem('signalos_custom_app_icon') || null);
    };
    loadBranding();
    window.addEventListener('branding_change', loadBranding);
    return () => {
      window.removeEventListener('branding_change', loadBranding);
    };
  }, []);
 
  return (
    <aside 
      className="fixed top-0 left-0 h-screen bg-bg-secondary/60 backdrop-blur-[20px] border-r border-white/5 flex flex-col z-[100] transition-all duration-250 ease-out"
      style={{ width: isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      {/* Logo */}
      <div 
        className="h-[64px] border-b border-white/5 flex items-center gap-3" 
        style={{ 
          padding: isCollapsed ? '0 20px' : '0 24px', 
          transition: 'padding var(--transition-normal)' 
        }}
      >
        {appIcon ? (
          <img src={appIcon} alt="" className="w-8 h-8 rounded-md object-cover shadow-[0_0_15px_rgba(99,102,241,0.2)]" />
        ) : (
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            <span className="font-extrabold text-sm">{appName.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight text-white">{appName}</span>
            <span className="text-[10px] text-text-muted font-mono leading-none">v{APP_VERSION}</span>
          </div>
        )}
      </div>
 
      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
 
          const IconComponent = item.icon;
 
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 py-3 rounded-md text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-150 ${
                isActive ? 'text-white bg-white/5' : ''
              }`}
              style={{
                padding: isCollapsed ? '12px' : '12px 16px',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                transition: 'padding var(--transition-normal)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconComponent className="w-5 h-5 shrink-0" />
              </span>
              {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              {isActive && (
                <div className="absolute left-0 top-[20%] w-[3px] h-[60%] bg-accent-primary rounded-r-md" />
              )}
            </Link>
          );
        })}
      </nav>
 
      {/* Collapse Toggle */}
      <div className="px-3 py-2 border-t border-white/5">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 py-2.5 rounded-md text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-150"
          style={{
            padding: isCollapsed ? '12px' : '12px 16px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            fontSize: '13px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer'
          }}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </span>
          {!isCollapsed && <span className="text-xs font-semibold">Collapse Menu</span>}
        </button>
      </div>
 
      {/* LAN Status */}
      {peerCount > 0 && (
        <div 
          className="p-4 border-t border-white/5 flex items-center justify-center"
        >
          {isCollapsed ? (
            <div 
              className="w-8 h-8 rounded-lg bg-status-success/10 border border-status-success/20 flex items-center justify-center text-status-success shadow-[0_0_15px_rgba(34,197,94,0.1)] cursor-help"
              title={`${peerCount} active peer${peerCount !== 1 ? 's' : ''} discovered on LAN`}
            >
              <span className="text-xs font-bold font-mono">{peerCount}</span>
            </div>
          ) : (
            <div className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-status-success/5 border border-status-success/15 shadow-[0_0_15px_rgba(34,197,94,0.05)]">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success"></span>
              </span>
              <span className="text-xs font-medium text-status-success">
                {peerCount} active peer{peerCount !== 1 ? 's' : ''} online
              </span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
