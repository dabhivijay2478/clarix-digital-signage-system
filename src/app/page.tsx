'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatCard from '../components/StatCard';
import ScheduleTimeline from '../components/ScheduleTimeline';
import { usePeers } from '../hooks/usePeers';
import { screensApi, playlistsApi, scheduleApi, analyticsApi } from '../lib/tauri';
import type { ScheduleSlot } from '../lib/types';
import { showToast } from '../components/Toast';

export default function DashboardPage() {
  const router = useRouter();
  const { peerCount } = usePeers();
  const [time, setTime] = useState('');

  // Real Database state
  const [screensCount, setScreensCount] = useState<number>(0);
  const [playlistsCount, setPlaylistsCount] = useState<number>(0);
  const [uptime, setUptime] = useState<string>('0%');
  const [impressions, setImpressions] = useState<string>('0');
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Time tracker for UI clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real data from Tauri commands on mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [screens, playlists, schedules, summary] = await Promise.all([
          screensApi.getAll(),
          playlistsApi.getAll(),
          scheduleApi.getAll(),
          analyticsApi.getSummary(),
        ]);

        setScreensCount(screens.length);
        setPlaylistsCount(playlists.length);
        setUptime(`${summary.uptime_pct.toFixed(1)}%`);

        const imps = summary.impressions;
        if (imps >= 1000) {
          setImpressions(`${(imps / 1000).toFixed(1)}K`);
        } else {
          setImpressions(String(imps));
        }

        setScheduleSlots(schedules);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Emergency Stop action: Set power status of all screens to false
  const handleEmergencyStop = async () => {
    try {
      const screens = await screensApi.getAll();
      if (screens.length === 0) {
        showToast('No registered screens to stop', 'info');
        return;
      }
      
      showToast('Shutting down all screens...', 'warning');
      await Promise.all(screens.map((screen) => screensApi.setPower(screen.id, false)));
      showToast('All screens powered off successfully', 'success');
      
      // Update local state display
      setScreensCount(screens.length);
    } catch (err) {
      showToast(`Emergency shutdown failed: ${err}`, 'error');
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 animate-fadeInDown">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-tertiary bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          System overview • {time}
        </p>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ animation: 'spin 1s linear infinite' }}>◔</div>
          <div className="empty-state-title">Loading system data...</div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 stagger">
            <StatCard
              icon="▣"
              value={screensCount}
              label="Active Screens"
              color="accent"
            />
            <StatCard
              icon="☰"
              value={playlistsCount}
              label="Playlists"
              color="info"
            />
            <StatCard
              icon="◔"
              value={uptime}
              label="Uptime"
              color="success"
            />
            <StatCard
              icon="◉"
              value={impressions}
              label="Impressions"
              color="warning"
            />
          </div>

          {/* Schedule Timeline */}
          <div className="mb-8 animate-fadeInUp">
            <h2 className="text-lg font-semibold text-white mb-4">Active Schedule</h2>
            {scheduleSlots.length === 0 ? (
              <div className="empty-state bg-bg-secondary/20 border border-white/5 rounded-2xl p-8 text-center">
                <span className="text-2xl text-text-muted mb-2">◔</span>
                <div className="text-sm font-semibold text-white">No active schedule slots</div>
                <p className="text-xs text-text-secondary mt-1">
                  Create a schedule slot to run playlist content on screens automatically.
                </p>
              </div>
            ) : (
              <ScheduleTimeline slots={scheduleSlots} />
            )}
          </div>
        </>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeInUp">
        {/* Quick Actions */}
        <div className="bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" onClick={() => router.push('/screens')}>
              ▣ Add Screen
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/content')}>
              ◧ Upload Content
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/playlists')}>
              ☰ New Playlist
            </button>
            <button className="btn btn-danger" onClick={handleEmergencyStop}>
              ⏻ Emergency Stop
            </button>
          </div>
        </div>

        {/* LAN Status */}
        <div className="bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Network</h3>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center py-2.5 border-b border-white/5">
              <span className="text-xs font-semibold text-text-secondary">LAN Peers</span>
              <span className="text-sm font-bold text-white">{peerCount}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-white/5">
              <span className="text-xs font-semibold text-text-secondary">Discovery</span>
              <span className="badge badge-success">Active</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-white/5">
              <span className="text-xs font-semibold text-text-secondary">Service</span>
              <span className="text-xs font-mono text-white">_signalos._tcp.local</span>
            </div>
            <div className="flex justify-between items-center py-2.5 last:border-b-0">
              <span className="text-xs font-semibold text-text-secondary">Sync Mode</span>
              <span className="text-sm font-semibold text-white">mDNS + TCP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
