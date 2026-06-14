'use client';

interface StatCardProps {
  icon: string;
  value: string | number;
  label: string;
  trend?: { value: number; positive: boolean };
  color?: 'accent' | 'success' | 'warning' | 'error' | 'info';
}

const colorStyles = {
  accent: {
    card: 'border-accent-primary/20 hover:border-accent-primary/40 focus:ring-accent-primary/20',
    iconBg: 'bg-accent-primary/10 text-accent-secondary',
  },
  success: {
    card: 'border-status-success/20 hover:border-status-success/40 focus:ring-status-success/20',
    iconBg: 'bg-status-success/10 text-status-success',
  },
  warning: {
    card: 'border-status-warning/20 hover:border-status-warning/40 focus:ring-status-warning/20',
    iconBg: 'bg-status-warning/10 text-status-warning',
  },
  error: {
    card: 'border-status-error/20 hover:border-status-error/40 focus:ring-status-error/20',
    iconBg: 'bg-status-error/10 text-status-error',
  },
  info: {
    card: 'border-status-info/20 hover:border-status-info/40 focus:ring-status-info/20',
    iconBg: 'bg-status-info/10 text-status-info',
  },
};

export default function StatCard({
  icon,
  value,
  label,
  trend,
  color = 'accent',
}: StatCardProps) {
  const currentStyle = colorStyles[color] || colorStyles.accent;

  return (
    <div className={`bg-bg-secondary/40 backdrop-blur-[20px] border border-white/5 rounded-2xl p-6 transition-all duration-250 hover:-translate-y-1 hover:border-white/10 hover:shadow-2xl ${currentStyle.card}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${currentStyle.iconBg}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-white tracking-tight animate-fadeInUp">
          {value}
        </span>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.positive
                ? 'bg-status-successMuted text-status-success'
                : 'bg-status-errorMuted text-status-error'
            }`}
          >
            {trend.positive ? '+' : '-'}
            {trend.value}%
          </span>
        )}
      </div>
    </div>
  );
}
