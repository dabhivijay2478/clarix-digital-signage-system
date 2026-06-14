'use client';

import type { Screen } from '../lib/types';
import { Pencil, Trash2 } from 'lucide-react';
 
interface ScreenCardProps {
  screen: Screen;
  onTogglePower: (id: string, on: boolean) => void;
  onBrightnessChange: (id: string, brightness: number) => void;
  onDelete: (id: string) => void;
  onEdit?: (screen: Screen) => void;
  onHours?: (screen: Screen) => void;
  onSync?: (id: string) => void;
  onManage?: (id: string) => void;
  isSyncing?: boolean;
}
 
export default function ScreenCard({
  screen,
  onTogglePower,
  onBrightnessChange,
  onDelete,
  onEdit,
  onHours,
  onSync,
  onManage,
  isSyncing = false,
}: ScreenCardProps) {
  const {
    id,
    name,
    location,
    is_online,
    power_on,
    brightness,
    resolution,
    orientation,
  } = screen;
 
  return (
    <div
      onClick={() => onManage && onManage(id)}
      className="group bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6 transition-all duration-250 hover:border-white/10 hover:shadow-2xl flex flex-col relative overflow-hidden cursor-pointer"
    >
      {/* Action overlay buttons — always visible and styled premium */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-4 flex items-center gap-1.5 z-10"
      >
        {onEdit && (
          <button
            onClick={() => onEdit(screen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-white bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-150"
            title="Edit Screen"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(id)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-white bg-white/5 border border-white/5 hover:bg-status-error/20 hover:text-status-error hover:border-status-error/30 transition-all duration-150"
          title="Delete Screen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Header Info */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex flex-col gap-1 pr-16">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 className="font-semibold text-white tracking-tight" style={{ margin: 0 }}>{name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSyncing
                    ? 'bg-indigo-400 animate-ping'
                    : is_online
                    ? 'bg-status-success shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse'
                    : 'bg-text-muted'
                }`}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: isSyncing ? '#818cf8' : is_online ? 'var(--status-success)' : 'var(--text-muted)'
                }}
              />
              <span className="text-[9px] uppercase font-bold tracking-wider text-text-secondary">
                {isSyncing ? 'Syncing' : is_online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          <span className="text-xs text-text-secondary">{location || 'No location set'}</span>
        </div>
      </div>

      {/* Metadata Info Grid */}
      <div className="grid grid-2 gap-y-3 gap-x-4 mb-6 border-t border-b border-white/5 py-4 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-text-muted">Resolution</span>
          <span className="font-medium text-white font-mono">
            {resolution?.width ?? 1920} × {resolution?.height ?? 1080}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-text-muted">Orientation</span>
          <span className="font-medium text-white">{orientation ?? 'Landscape'}</span>
        </div>
        <div className="flex flex-col gap-0.5 col-span-2">
          <span className="text-text-muted">Network Address</span>
          <span className="font-medium text-white font-mono">
            {screen.ip_address ?? 'Not assigned'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 mt-auto"
      >
        {/* Power switch */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary">Power State</span>
          <input
            type="checkbox"
            checked={power_on}
            onChange={(e) => onTogglePower(id, e.target.checked)}
            className="relative w-11 h-6 appearance-none bg-bg-tertiary border border-white/5 rounded-full cursor-pointer transition-all duration-150 outline-none before:content-[''] before:absolute before:top-[2px] before:left-[2px] before:w-[18px] before:h-[18px] before:rounded-full before:bg-text-muted before:transition-all checked:bg-accent-primary checked:border-accent-primary checked:before:left-[22px] checked:before:bg-white"
          />
        </div>

        {/* Brightness slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-secondary">Brightness</span>
            <span className="font-bold text-accent-secondary font-mono">{brightness}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={brightness}
            disabled={!power_on}
            onChange={(e) => onBrightnessChange(id, parseInt(e.target.value))}
            className="w-full h-1 bg-bg-tertiary rounded-full appearance-none outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-accent-primary [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(99,102,241,0.4)] [&::-webkit-slider-thumb]:transition-all hover:[&::-webkit-slider-thumb]:scale-120 hover:[&::-webkit-slider-thumb]:shadow-[0_0_16px_rgba(99,102,241,0.6)]"
          />
        </div>

        {/* Sync button */}
        {onSync && (
          <button
            className={`btn w-full mt-2 transition-all duration-150 ${
              screen.ip_address
                ? 'btn-primary'
                : 'btn-secondary opacity-50 cursor-not-allowed'
            }`}
            disabled={!screen.ip_address}
            onClick={() => onSync(id)}
          >
            {is_online ? '⚡ Sync to Device' : '⚡ Force Sync (Offline)'}
          </button>
        )}
      </div>
    </div>
  );
}
