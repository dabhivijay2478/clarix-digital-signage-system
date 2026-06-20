'use client';

import { useEffect, useState, useCallback } from 'react';
import { screensApi, onScheduleChange } from '../lib/tauri';
import type { Screen } from '../lib/types';

export function useScreens() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScreens = useCallback(async () => {
    try {
      const data = await screensApi.getAll();
      setScreens(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScreens();

    // Re-fetch when schedule changes affect screens
    const unlisten = onScheduleChange(() => {
      fetchScreens();
    });

    return () => {
      unlisten();
    };
  }, [fetchScreens]);

  const addScreen = useCallback(
    async (
      name: string,
      location: string,
      ipAddress?: string,
      orientation?: string,
      resolutionW?: number,
      resolutionH?: number,
      playlistId?: string
    ) => {
      try {
        const screen = await screensApi.add(
          name,
          location,
          ipAddress,
          orientation,
          resolutionW,
          resolutionH,
          playlistId
        );
        setScreens((prev) => [...prev, screen]);
        return screen;
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    []
  );

  const setPower = useCallback(async (id: string, on: boolean) => {
    try {
      await screensApi.setPower(id, on);
      setScreens((prev) =>
        prev.map((s) => (s.id === id ? { ...s, power_on: on } : s))
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const setBrightness = useCallback(async (id: string, brightness: number) => {
    try {
      await screensApi.setBrightness(id, brightness);
      setScreens((prev) =>
        prev.map((s) => (s.id === id ? { ...s, brightness } : s))
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const deleteScreen = useCallback(async (id: string) => {
    try {
      await screensApi.delete(id);
      setScreens((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const editScreen = useCallback(
    async (
      id: string,
      name: string,
      location: string,
      ipAddress?: string,
      orientation?: string,
      resolutionW?: number,
      resolutionH?: number,
      playlistId?: string
    ) => {
      try {
        await screensApi.edit(
          id,
          name,
          location,
          ipAddress,
          orientation,
          resolutionW,
          resolutionH,
          playlistId
        );
        setScreens((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  name,
                  location,
                  ip_address: ipAddress || null,
                  orientation: (orientation as any) || s.orientation,
                  resolution: {
                    width: resolutionW ?? s.resolution.width,
                    height: resolutionH ?? s.resolution.height,
                  },
                  playlist_id: playlistId ?? s.playlist_id,
                }
              : s
          )
        );
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    []
  );

  const updateOperatingHours = useCallback(
    async (id: string, operatingHours: any) => {
      try {
        await screensApi.updateOperatingHours(id, operatingHours);
        setScreens((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, operating_hours: operatingHours } : s
          )
        );
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    []
  );

  return {
    screens,
    loading,
    error,
    addScreen,
    editScreen,
    updateOperatingHours,
    setPower,
    setBrightness,
    deleteScreen,
    refresh: fetchScreens,
  };
}
