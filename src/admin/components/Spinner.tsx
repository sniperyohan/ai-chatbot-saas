import React from 'react'
import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 20, color = 'var(--primary)' }: { size?: number; color?: string }) {
  return <Loader2 size={size} color={color} style={{ animation: 'spin 1s linear infinite' }}/>
}
