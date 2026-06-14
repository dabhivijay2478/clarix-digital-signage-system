'use client';

import { useEffect, useState, useCallback } from 'react';
import { analyticsApi } from '../lib/tauri';
import type { AnalyticsSummary, AnalyticsTimelineEntry } from '../lib/types';

export function useAnalytics(screenId?: string) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeline, setTimeline] = useState<AnalyticsTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(7); // days

  const fetchData = useCallback(async () => {
    try {
      const [summaryData, timelineData] = await Promise.all([
        analyticsApi.getSummary(screenId),
        analyticsApi.getTimeline(timeRange, screenId),
      ]);
      setSummary(summaryData);
      setTimeline(timelineData);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [screenId, timeRange]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    summary,
    timeline,
    loading,
    error,
    timeRange,
    setTimeRange,
    refresh: fetchData,
  };
}
