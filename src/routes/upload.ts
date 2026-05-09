// =====================================================
// 이미지 업로드 API (Cloudflare R2)
// POST /api/admin/upload/image  - 이미지 업로드
// =====================================================
import { Hono } from 'hono'
import { adminAuthMiddleware } from '../middleware/auth'
import { Bindings, Variables } from '../types'

const upload = new Hono<{ Bindings: Bindings; Variables: Variables }>()
upload.use('*', adminAuthMiddleware)

// 허용 이미지 타입
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// ─────────────────────────────────────────
// POST /api/admin/upload/image
// 이미지 파일을 R2에 업로드 → public URL 반환
// ─────────────────────────────────────────
upload.post('/image', async (c) => {
  try {
    const tenantId = c.get('tenantId')
    if (!tenantId) {
      return c.json({ success: false, error: '인증이 필요합니다.' }, 401)
    }

    // multipart/form-data 파싱
    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return c.json({ success: false, error: '파일이 첨부되지 않았습니다.' }, 400)
    }

    // 1) 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return c.json({
        success: false,
        error: `파일 크기는 ${MAX_FILE_SIZE / 1024 / 1024}MB 이하여야 합니다. (현재: ${(file.size / 1024 / 1024).toFixed(2)}MB)`
      }, 400)
    }

    // 2) 타입 검증
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({
        success: false,
        error: `지원하지 않는 파일 형식입니다. (jpg, png, webp, gif만 허용)`
      }, 400)
    }

    // 3) 파일명 생성 (충돌 방지: tenantId/timestamp_랜덤.확장자)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    const key = `scenarios/${tenantId}/${timestamp}_${random}.${ext}`

    // 4) R2 업로드
    const arrayBuffer = await file.arrayBuffer()
    await c.env.IMAGES.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // 1년 캐시
      },
    })

    // 5) Public URL 생성
    const publicUrl = `${c.env.R2_PUBLIC_URL}/${key}`

    console.log(`[upload] tenant=${tenantId} key=${key} size=${file.size}`)

    return c.json({
      success: true,
      data: {
        url: publicUrl,
        key,
        size: file.size,
        type: file.type,
      }
    })
  } catch (e: any) {
    console.error('[upload] error:', e)
    return c.json({ success: false, error: '업로드 실패: ' + (e?.message || '알 수 없는 오류') }, 500)
  }
})

export default upload
