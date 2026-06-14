'use client';

import { useEffect, useState, useCallback } from 'react';
import { scheduleApi } from '../lib/tauri';
import type { ScheduleSlot, AppWeekday } from '../lib/types';

export function useSchedule() {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const data = await scheduleApi.getAll();
      setSlots(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const addSlot = useCallback(
    async (
      name: string,
      screenIds: string[],
      playlistId: string,
      startTime: string,
      durationMins: number,
      daysOfWeek: AppWeekday[],
      priority: number = 1
    ) => {
      try {
        await scheduleApi.add(
          name, screenIds, playlistId,
          startTime, durationMins, daysOfWeek, priority
        );
        await fetchSchedule();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchSchedule]
  );

  const deleteSlot = useCallback(
    async (id: string) => {
      try {
        await scheduleApi.delete(id);
        setSlots((prev) => prev.filter((s) => s.id !== id));
      } catch (e) {
        setError(String(e));
      }
    },
    []
  );

  return { slots, loading, error, addSlot, deleteSlot, refresh: fetchSchedule };
}
