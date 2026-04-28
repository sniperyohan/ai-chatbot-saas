import React, { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, GripVertical, Tag } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/Toast'
import { api } from '../lib/api'

interface Category {
  id: string
  name: string
  sort_order: number
  is_active: number
  created_at: string
}

export default function CategoriesPage() {
  const toast = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const res = await api.getCategories()
      if (res.success) setCategories(res.data || [])
    } catch (e) {
      toast.error('카테고리를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCategories() }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const res = await api.addCategory({ name })
      if (res.success) {
        toast.success(`'${name}' 카테고리가 추가되었습니다.`)
        setNewName('')
        await fetchCategories()
      } else {
        toast.error(res.error || '추가에 실패했습니다.')
      }
    } catch (e) {
      toast.error('추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const handleEdit = (cat: Category) => {
    setEditId(cat.id)
    setEditName(cat.name)
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await api.updateCategory(id, { name })
      if (res.success) {
        toast.success('카테고리가 수정되었습니다.')
        setEditId(null)
        await fetchCategories()
      } else {
        toast.error(res.error || '수정에 실패했습니다.')
      }
    } catch (e) {
      toast.error('수정 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await api.deleteCategory(id)
      if (res.success) {
        toast.success('카테고리가 삭제되었습니다.')
        setDeleteConfirmId(null)
        await fetchCategories()
      } else {
        toast.error(res.error || '삭제에 실패했습니다.')
      }
    } catch (e) {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* 헤더 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Tag size={22} color="var(--primary)" />
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            카테고리 관리
          </h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          FAQ를 분류할 카테고리를 관리합니다. 삭제 시 해당 카테고리를 사용 중인 FAQ가 없어야 합니다.
        </p>
      </div>

      {/* 카테고리 추가 */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px', marginBottom: '16px'
      }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
          새 카테고리 추가
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="카테고리 이름 입력 (예: 배송, 결제, 환불)"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', borderRadius: '8px',
              background: 'var(--primary)', color: '#fff',
              border: 'none', cursor: adding ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
              opacity: adding || !newName.trim() ? 0.6 : 1,
            }}
          >
            <Plus size={16} />
            {adding ? '추가 중...' : '추가'}
          </button>
        </div>
      </div>

      {/* 카테고리 목록 */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '12px', overflow: 'hidden'
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            카테고리 목록
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            총 {categories.length}개
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
            불러오는 중...
          </div>
        ) : categories.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
            카테고리가 없습니다. 위에서 추가해보세요!
          </div>
        ) : (
          categories.map((cat, idx) => (
            <div key={cat.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px',
              borderBottom: idx < categories.length - 1 ? '1px solid var(--border)' : 'none',
              background: 'var(--bg-secondary)',
            }}>
              <GripVertical size={16} color="var(--text-secondary)" style={{ flexShrink: 0, cursor: 'grab' }} />

              {editId === cat.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEditSave(cat.id)
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: '6px',
                    border: '1px solid var(--primary)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {cat.name}
                </span>
              )}

              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {editId === cat.id ? (
                  <>
                    <button
                      onClick={() => handleEditSave(cat.id)}
                      disabled={saving}
                      style={{
                        padding: '6px 12px', borderRadius: '6px',
                        background: 'var(--primary)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                        fontWeight: 600, fontFamily: 'inherit',
                      }}
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      style={{
                        padding: '6px 12px', borderRadius: '6px',
                        background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                        fontSize: '12px', fontFamily: 'inherit',
                      }}
                    >
                      취소
                    </button>
                  </>
                ) : deleteConfirmId === cat.id ? (
                  <>
                    <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginRight: '4px' }}>
                      삭제할까요?
                    </span>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      style={{
                        padding: '6px 12px', borderRadius: '6px',
                        background: '#DC2626', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                        fontWeight: 600, fontFamily: 'inherit',
                      }}
                    >
                      확인
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      style={{
                        padding: '6px 12px', borderRadius: '6px',
                        background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                        fontSize: '12px', fontFamily: 'inherit',
                      }}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleEdit(cat)}
                      style={{
                        padding: '6px 8px', borderRadius: '6px',
                        background: 'none', border: '1px solid var(--border)',
                        cursor: 'pointer', color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(cat.id)}
                      style={{
                        padding: '6px 8px', borderRadius: '6px',
                        background: 'none', border: '1px solid #FECACA',
                        cursor: 'pointer', color: '#DC2626',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  )
}
