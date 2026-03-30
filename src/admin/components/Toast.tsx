import React from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

const toastStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px',
  borderRadius: '10px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  animation: 'slideInRight 0.3s ease-out',
  minWidth: '280px',
  maxWidth: '380px',
  fontFamily: 'inherit',
  fontSize: '14px',
  fontWeight: 500,
}

export default function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          ...toastStyle,
          background: t.type === 'success' ? '#ECFDF5' : t.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          border: `1px solid ${t.type === 'success' ? '#6EE7B7' : t.type === 'error' ? '#FECACA' : '#BFDBFE'}`,
          color: t.type === 'success' ? '#065F46' : t.type === 'error' ? '#991B1B' : '#1E40AF',
        }}>
          {t.type === 'success' ? <CheckCircle size={18} color="#059669"/> : <XCircle size={18} color="#DC2626"/>}
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.6 }}>
            <X size={14}/>
          </button>
        </div>
      ))}
    </div>
  )
}
