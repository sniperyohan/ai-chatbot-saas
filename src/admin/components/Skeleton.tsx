import React from 'react'

const skeletonStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-primary) 50%, var(--border) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '6px',
}

export function Skeleton({ width = '100%', height = '20px', style }: { width?: string; height?: string; style?: React.CSSProperties }) {
  return <div style={{ ...skeletonStyle, width, height, ...style }}/>
}

export function SkeletonStats() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <Skeleton width="44px" height="44px" style={{ borderRadius: '12px', marginBottom: '12px' }}/>
          <Skeleton width="60px" height="28px" style={{ marginBottom: '8px' }}/>
          <Skeleton width="100px" height="16px"/>
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
      <Skeleton width="120px" height="20px" style={{ marginBottom: '16px' }}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1,2,3].map(i => <Skeleton key={i} height="16px"/>)}
      </div>
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1,2,3,4,5].map(i => <Skeleton key={i} height="48px"/>)}
    </div>
  )
}
