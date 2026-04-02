-- =====================================================
-- Supabase RPC: match_documents
-- 벡터 유사도 검색 (cosine similarity, pgvector)
-- 
-- 사용 전 준비사항:
-- 1. CREATE EXTENSION IF NOT EXISTS vector;
-- 2. documents 테이블에 embedding vector(768) 컬럼 필요
-- 3. HNSW 인덱스 권장:
--    CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
-- =====================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding   vector(768),
  match_tenant_id   uuid,
  match_threshold   float DEFAULT 0.7,
  match_count       int   DEFAULT 3
)
RETURNS TABLE (
  id          uuid,
  question    text,
  answer      text,
  category    text,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    COALESCE(d.refined_question, d.original_question, d.question)  AS question,
    COALESCE(d.refined_answer,   d.original_answer,   d.answer)    AS answer,
    d.category,
    (1 - (d.embedding <=> query_embedding))::float                 AS similarity
  FROM documents d
  WHERE
    d.tenant_id  = match_tenant_id
    AND d.is_active  = true
    AND (d.is_deleted IS NULL OR d.is_deleted = false)
    AND d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 권한 부여 (anon / authenticated 모두 호출 가능)
GRANT EXECUTE ON FUNCTION match_documents(vector, uuid, float, int) TO anon;
GRANT EXECUTE ON FUNCTION match_documents(vector, uuid, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION match_documents(vector, uuid, float, int) TO service_role;
