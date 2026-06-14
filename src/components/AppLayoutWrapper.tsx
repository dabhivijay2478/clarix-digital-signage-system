'use client';
 
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
 
export default function AppLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPlayer = pathname === '/player' || pathname?.startsWith('/player/');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Load collapse state
    const saved = localStorage.getItem('signalos_sidebar_collapsed');
    if (saved === 'true') {
      setSidebarCollapsed(true);
    }
 
    const handleToggleEvent = () => {
      const current = localStorage.getItem('signalos_sidebar_collapsed') === 'true';
      setSidebarCollapsed(current);
    };
 
    window.addEventListener('sidebar_collapsed_change', handleToggleEvent);
 
    const applyBranding = () => {
      const customAppName = localStorage.getItem('signalos_custom_app_name') || 'SignalOS';
      const customFavicon = localStorage.getItem('signalos_custom_favicon');
 
      document.title = `${customAppName} — Digital Signage Management`;
 
      if (customFavicon) {
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = customFavicon;
      }
    };
 
    applyBranding();
    window.addEventListener('branding_change', applyBranding);
    return () => {
      window.removeEventListener('branding_change', applyBranding);
      window.removeEventListener('sidebar_collapsed_change', handleToggleEvent);
    };
  }, []);
 
  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('signalos_sidebar_collapsed', String(next));
      window.dispatchEvent(new Event('sidebar_collapsed_change'));
      return next;
    });
  };

  if (isPlayer) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-black p-0 m-0 select-none">
        {children}
      </div>
    );
  }
 
  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <main className="main-content" style={{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)', transition: 'margin-left var(--transition-normal)' }}>
        {children}
      </main>
    </div>
  );
}
