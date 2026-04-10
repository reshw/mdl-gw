# Mailer - 서버리스 메일링 시스템 아키텍처

## 개요

메일 서버 없이 동작하는 서버리스 그룹웨어 메일 시스템.
도메인: `mdl.kr`
대상: 10~20명 동시접속

## 아키텍처 흐름

### 수신
```
외부 메일 → mdl.kr → Cloudflare Email Routing
                           ↓
                   Cloudflare Email Worker (파싱)
                           ↓
              Firebase Firestore (메일 저장)
              Cloudflare R2 (첨부파일 저장)
                           ↓
                       Next.js 그룹웨어 UI
```

### 발신
```
Next.js 그룹웨어 UI → Resend API → 외부 메일
```

## 기술 스택

| 역할 | 기술 | 무료 한도 |
|------|------|-----------|
| 프론트엔드 | Next.js + Vercel | 충분 |
| 수신 처리 | Cloudflare Email Worker | 100,000 req/day |
| 메일 DB | Firebase Firestore | 1GB / 50,000 reads/day / 20,000 writes/day |
| 인증 | Firebase Auth | 무제한 |
| 발신 | Resend | 3,000통/월 |
| 첨부파일 | Cloudflare R2 | 10GB / 이그레스 무료 |

## 선택 이유

- **메일 서버 불필요**: Cloudflare Email Routing이 수신 담당
- **완전 서버리스**: PC 상시 가동 불필요
- **전체 무료 티어**: 소규모 운영 비용 0원
- **R2 선택 이유**: Firebase Storage(5GB)보다 2배 용량, 이그레스 비용 없음
- **Firestore 선택 이유**: 메일 저장소 수준엔 충분, Auth/Storage와 한 세트

## 구현 순서

1. Firebase 프로젝트 생성 (Firestore + Auth)
2. Next.js 프로젝트 생성
3. Cloudflare Email Worker 작성 (수신 → Firestore 저장, 첨부파일 → R2)
4. Resend 도메인 연동 (mdl.kr SPF/DKIM 설정)
5. 그룹웨어 UI 구현 (메일 목록, 뷰어, 작성/발송)

## 주의사항

- SPF/DKIM: Cloudflare(수신)용과 Resend(발신)용 DNS 레코드 둘 다 설정 필요
- Cloudflare Email Worker는 Workers 무료 티어에서 동작 가능
