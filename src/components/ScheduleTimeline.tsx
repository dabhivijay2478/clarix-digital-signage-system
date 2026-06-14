'use client';

import type { ScheduleSlot } from '../lib/types';

interface ScheduleTimelineProps {
  slots: ScheduleSlot[];
  onDelete?: (id: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ScheduleTimeline({
  slots,
  onDelete,
}: ScheduleTimelineProps) {
  // Helpers to resolve slot blocks positioning
  const getSlotPosition = (startTimeStr: string, durationMins: number) => {
    // Expected format "HH:MM:SS" or "HH:MM"
    const parts = startTimeStr.split(':');
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;

    const startPercent = ((hours * 60 + minutes) / (24 * 60)) * 100;
    const durationPercent = (durationMins / (24 * 60)) * 100;

    return {
      left: `${startPercent}%`,
      width: `${durationPercent}%`,
    };
  };

  return (
    <div className="bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6 overflow-x-auto select-none">
      <div className="min-w-[900px]">
        {/* Timeline hour grid header */}
        <div className="flex border-b border-white/5 pb-2 mb-4 text-[10px] font-bold text-text-muted uppercase tracking-wider pl-16">
          {HOURS.map((hour) => (
            <div key={hour} className="flex-1 text-center border-l border-white/5 min-w-[32px] first:border-l-0">
              {hour.toString().padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Days rows */}
        <div className="flex flex-col gap-2 relative">
          {DAYS.map((day) => {
            // Filter slots active on this day
            const daySlots = slots.filter((slot) =>
              slot.days_of_week.includes(day as any)
            );

            return (
              <div key={day} className="flex items-center group/row min-h-[44px] relative pl-16">
                {/* Day label */}
                <div className="absolute left-0 w-12 font-semibold text-xs text-text-secondary select-none">
                  {day}
                </div>

                {/* Day track */}
                <div className="flex-1 h-8 bg-bg-primary/20 border border-white/5 rounded-lg relative overflow-hidden">
                  {/* Grid tick lines */}
                  <div className="absolute inset-0 flex">
                    {HOURS.map((hour) => (
                      <div key={hour} className="flex-1 border-l border-white/5 first:border-l-0" />
                    ))}
                  </div>

                  {/* Allocated slots blocks */}
                  {daySlots.map((slot) => {
                    const pos = getSlotPosition(slot.start_time, slot.duration_mins);
                    return (
                      <div
                        key={`${slot.id}-${day}`}
                        style={{ left: pos.left, width: pos.width }}
                        className="absolute top-1 bottom-1 bg-gradient-to-r from-accent-primary to-accent-tertiary text-white rounded px-2 py-0.5 text-[10px] font-semibold flex items-center justify-between shadow-[0_0_8px_rgba(99,102,241,0.2)] hover:shadow-[0_0_12px_rgba(99,102,241,0.4)] transition-all cursor-pointer truncate"
                        title={`${slot.name} (${slot.start_time} • ${slot.duration_mins} mins)`}
                      >
                        <span className="truncate">{slot.name}</span>
                        {onDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(slot.id);
                            }}
                            className="ml-1 opacity-0 hover:opacity-100 focus:opacity-100 text-[8px] bg-black/40 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-opacity"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
