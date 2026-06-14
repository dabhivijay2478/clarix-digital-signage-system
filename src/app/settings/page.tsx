'use client';
 
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '../../components/Toast';
import { SettingsSection, SettingsRow } from '../../components/SettingsSection';
import { APP_VERSION } from '../../lib/constants';
import styles from './page.module.css';
 
export default function SettingsPage() {
  const router = useRouter();
  const [port, setPort] = useState(7420);
  const [autoStart, setAutoStart] = useState(true);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Brand customization states
  const [customAppName, setCustomAppName] = useState('SignalOS');
  const [customAppIcon, setCustomAppIcon] = useState<string | null>(null);
  const [customFavicon, setCustomFavicon] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
 
  useEffect(() => {
    import('../../lib/tauri').then(({ lanApi }) => {
      lanApi.getServerPort().then(setPort).catch(console.error);
    });
 
    if (typeof window !== 'undefined') {
      setCustomAppName(localStorage.getItem('signalos_custom_app_name') || 'SignalOS');
      setCustomAppIcon(localStorage.getItem('signalos_custom_app_icon') || null);
      setCustomFavicon(localStorage.getItem('signalos_custom_favicon') || null);
      setIsSidebarCollapsed(localStorage.getItem('signalos_sidebar_collapsed') === 'true');
 
      const handleToggleEvent = () => {
        setIsSidebarCollapsed(localStorage.getItem('signalos_sidebar_collapsed') === 'true');
      };
      window.addEventListener('sidebar_collapsed_change', handleToggleEvent);
      return () => {
        window.removeEventListener('sidebar_collapsed_change', handleToggleEvent);
      };
    }
  }, []);

  const handleLaunchPlayer = () => {
    router.push('/player');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'icon' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'icon') {
        setCustomAppIcon(base64);
      } else {
        setCustomFavicon(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = () => {
    try {
      localStorage.setItem('signalos_custom_app_name', customAppName);
      if (customAppIcon) {
        localStorage.setItem('signalos_custom_app_icon', customAppIcon);
      }
      if (customFavicon) {
        localStorage.setItem('signalos_custom_favicon', customFavicon);
      }
      
      // Dispatch custom event to trigger real-time updates across the app layout
      window.dispatchEvent(new Event('branding_change'));
      showToast('Branding preferences saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save branding preferences', 'error');
    }
  };

  const handleToggleSidebar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setIsSidebarCollapsed(next);
    localStorage.setItem('signalos_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('sidebar_collapsed_change'));
  };
 
  const handleResetBranding = () => {
    if (confirm('Reset custom branding back to system defaults?')) {
      localStorage.removeItem('signalos_custom_app_name');
      localStorage.removeItem('signalos_custom_app_icon');
      localStorage.removeItem('signalos_custom_favicon');
      
      setCustomAppName('SignalOS');
      setCustomAppIcon(null);
      setCustomFavicon(null);
 
      window.dispatchEvent(new Event('branding_change'));
      showToast('Branding reset to system defaults', 'success');
    }
  };
 
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure SignalOS preferences</p>
      </div>
 
      <div className={styles.sections}>
        {/* Device Mode */}
        <SettingsSection 
          title="Device Operation Mode"
          description="Configure whether this machine runs as a central Controller (CMS) or a Screen Player."
        >
          <div className="flex flex-col gap-4 mt-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Digital Signage Screen Player</h3>
                <p className="text-xs text-text-secondary mt-1">
                  Switches this application window to full-screen digital signage playback mode.
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleLaunchPlayer}
              >
                Launch Screen Player
              </button>
            </div>
          </div>
        </SettingsSection>

        {/* Brand Customization */}
        <SettingsSection
          title="Brand Customization"
          description="Customize the name, icon, and tab favicon of this management system."
        >
          <div className="flex flex-col gap-6 mt-6">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="input-label" style={{ fontWeight: '600', color: 'white' }}>Custom App Name</label>
              <input
                className="input"
                style={{ width: '100%', maxWidth: '400px' }}
                value={customAppName}
                onChange={(e) => setCustomAppName(e.target.value)}
                placeholder="e.g., SignalOS"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '600px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="input-label" style={{ fontWeight: '600', color: 'white' }}>App Icon</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {customAppIcon ? (
                    <img src={customAppIcon} alt="App Icon" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'white' }}>S</div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'icon')}
                    style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="input-label" style={{ fontWeight: '600', color: 'white' }}>Favicon</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {customFavicon ? (
                    <img src={customFavicon} alt="Favicon" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'white' }}>F</div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'favicon')}
                    style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button className="btn btn-primary" onClick={handleSaveBranding}>
                Save Branding Preferences
              </button>
              <button className="btn btn-secondary" onClick={handleResetBranding}>
                Reset to Default
              </button>
            </div>
          </div>
        </SettingsSection>
 
        {/* General */}
        <SettingsSection title="General">
          <div className={styles.settingsList}>
            <SettingsRow 
              label="Auto-start on boot" 
              description="Launch SignalOS automatically when the system starts"
            >
              <input
                type="checkbox"
                className="toggle"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
            </SettingsRow>
            
            <SettingsRow 
              label="Notifications" 
              description="Show desktop notifications for schedule changes and alerts"
            >
              <input
                type="checkbox"
                className="toggle"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
            </SettingsRow>
 
            <SettingsRow 
              label="Collapse Sidebar" 
              description="Minimize the navigation sidebar to icons only"
            >
              <input
                type="checkbox"
                className="toggle"
                checked={isSidebarCollapsed}
                onChange={handleToggleSidebar}
              />
            </SettingsRow>
          </div>
        </SettingsSection>
 
        {/* Network */}
        <SettingsSection title="Network & Discovery">
          <div className={styles.settingsList}>
            <SettingsRow 
              label="LAN Discovery" 
              description="Enable mDNS service discovery for peer screens"
            >
              <input
                type="checkbox"
                className="toggle"
                checked={discoveryEnabled}
                onChange={(e) => setDiscoveryEnabled(e.target.checked)}
              />
            </SettingsRow>
            
            <SettingsRow label="Service Type" monoValue="_signalos._tcp.local." />
            <SettingsRow label="Controller Port" monoValue={port} />
          </div>
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About">
          <div className={styles.settingsList}>
            <SettingsRow label="Version" monoValue={APP_VERSION} />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
