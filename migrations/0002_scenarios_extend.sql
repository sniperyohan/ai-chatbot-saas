-- =====================================================
-- 시나리오 테이블 확장 (동적 시나리오 시스템 지원)
-- =====================================================

-- 아이콘 (이모지)
ALTER TABLE scenarios ADD COLUMN icon TEXT DEFAULT '💬';

-- 설명 (카드에 표시할 부가 설명)
ALTER TABLE scenarios ADD COLUMN description TEXT DEFAULT '';

-- 카드 색상 (HEX)
ALTER TABLE scenarios ADD COLUMN color TEXT DEFAULT '#10B981';

-- 정렬 순서 (낮을수록 먼저 매칭/표시)
ALTER TABLE scenarios ADD COLUMN sort_order INTEGER DEFAULT 0;
