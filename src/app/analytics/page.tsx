'use client';

import { useAnalytics } from '../../hooks/useAnalytics';
import StatCard from '../../components/StatCard';
import styles from './page.module.css';

export default function AnalyticsPage() {
  const { summary, timeline, loading, timeRange, setTimeRange } = useAnalytics();

  const formatNumber = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Performance metrics and insights</p>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              className={`btn btn-sm ${timeRange === d ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTimeRange(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-4 stagger" style={{ marginBottom: '24px' }}>
        <StatCard
          icon="👁"
          value={summary ? formatNumber(summary.impressions) : '—'}
          label="Impressions"
          trend={{ value: 12, positive: true }}
          color="accent"
        />
        <StatCard
          icon="▶"
          value={summary ? formatNumber(summary.plays) : '—'}
          label="Plays"
          color="info"
        />
        <StatCard
          icon="⏱"
          value={summary ? `${summary.avg_dwell_secs.toFixed(1)}s` : '—'}
          label="Avg Dwell Time"
          color="warning"
        />
        <StatCard
          icon="◔"
          value={summary ? `${summary.uptime_pct}%` : '—'}
          label="Uptime"
          trend={{ value: 0.1, positive: true }}
          color="success"
        />
      </div>

      {/* Charts Area */}
      <div className="grid-2" style={{ marginBottom: '24px' }}>
        {/* Timeline Chart (placeholder — canvas rendering) */}
        <div className="glass-card-static">
          <h3 className="section-title">Event Timeline</h3>
          <div className={styles.chartArea}>
            {loading ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div style={{ animation: 'spin 1s linear infinite' }}>◔</div>
              </div>
            ) : timeline.length === 0 ? (
              <div className={styles.chartPlaceholder}>
                <span className={styles.chartIcon}>📊</span>
                <span className={styles.chartText}>No data for this period</span>
              </div>
            ) : (
              <div className={styles.barChart}>
                {timeline.slice(0, 14).map((entry, i) => (
                  <div key={i} className={styles.barColumn}>
                    <div
                      className={styles.bar}
                      style={{
                        height: `${Math.min((entry.count / Math.max(...timeline.map(t => t.count))) * 100, 100)}%`,
                        background: entry.event_type === 'Impression'
                          ? 'var(--accent-primary)'
                          : entry.event_type === 'Play'
                          ? 'var(--info)'
                          : 'var(--success)',
                      }}
                    />
                    <span className={styles.barLabel}>
                      {entry.date.slice(-2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Completion Rate */}
        <div className="glass-card-static">
          <h3 className="section-title">Completion Rate</h3>
          <div className={styles.completionGrid}>
            <div className={styles.completionItem}>
              <div className={styles.completionLabel}>Completed</div>
              <div className={styles.completionValue} style={{ color: 'var(--success)' }}>
                {summary ? formatNumber(summary.completions) : '—'}
              </div>
            </div>
            <div className={styles.completionItem}>
              <div className={styles.completionLabel}>Skipped</div>
              <div className={styles.completionValue} style={{ color: 'var(--error)' }}>
                {summary ? formatNumber(summary.skips) : '—'}
              </div>
            </div>
            <div className={styles.completionItem}>
              <div className={styles.completionLabel}>Rate</div>
              <div className={styles.completionValue} style={{ color: 'var(--accent-secondary)' }}>
                {summary && (summary.completions + summary.skips) > 0
                  ? `${((summary.completions / (summary.completions + summary.skips)) * 100).toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className={styles.completionItem}>
              <div className={styles.completionLabel}>Total Events</div>
              <div className={styles.completionValue}>
                {summary
                  ? formatNumber(summary.impressions + summary.plays + summary.completions + summary.skips)
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
