/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a2e',
          elevated: '#1e1e32',
          hover: '#252540',
        },
        glass: {
          bg: 'rgba(20, 20, 40, 0.6)',
          border: 'rgba(255, 255, 255, 0.06)',
          hover: 'rgba(30, 30, 55, 0.8)',
        },
        accent: {
          primary: '#6366f1',
          secondary: '#818cf8',
          tertiary: '#a78bfa',
        },
        status: {
          success: '#22c55e',
          successMuted: 'rgba(34, 197, 94, 0.15)',
          warning: '#f59e0b',
          warningMuted: 'rgba(245, 158, 11, 0.15)',
          error: '#ef4444',
          errorMuted: 'rgba(239, 68, 68, 0.15)',
          info: '#3b82f6',
          infoMuted: 'rgba(59, 130, 246, 0.15)',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#64748b',
        }
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-out forwards',
        fadeInUp: 'fadeInUp 0.5s ease-out forwards',
        fadeInDown: 'fadeInDown 0.5s ease-out forwards',
        slideInLeft: 'slideInLeft 0.4s ease-out forwards',
        slideInRight: 'slideInRight 0.4s ease-out forwards',
        scaleIn: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        shimmer: 'shimmer 2s infinite linear',
        glow: 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99, 102, 241, 0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(99, 102, 241, 0.6), 0 0 48px rgba(99, 102, 241, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}
