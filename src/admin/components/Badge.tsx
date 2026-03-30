import React from 'react'

type BadgeVariant = 'indigo' | 'green' | 'red' | 'yellow' | 'gray' | 'blue'

const variants: Record<BadgeVariant, { bg: string; color: string }> = {
  indigo: { bg: 'rgba(79,70,229,0.1)', color: '#4F46E5' },
  green:  { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  red:    { bg: 'rgba(239,68,68,0.1)', color: '#DC2626' },
  yellow: { bg: 'rgba(245,158,11,0.1)', color: '#D97706' },
  gray:   { bg: 'var(--bg-primary)', color: 'var(--text-secondary)' },
  blue:   { bg: 'rgba(59,130,246,0.1)', color: '#2563EB' },
}

export default function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const v = variants[variant]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 600,
      background: v.bg,
      color: v.color,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
