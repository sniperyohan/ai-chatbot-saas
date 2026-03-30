// 공통 CSS 클래스 유틸리티 (Tailwind 없이 동작)
// 모든 스타일은 index.css의 CSS 변수를 사용

export const cls = (...args: (string | false | null | undefined)[]): string =>
  args.filter(Boolean).join(' ')
