# Mail Groupware 기술스택

## 전체 시스템 구성도

```
[메일 수신]              [웹 프론트엔드 / API]         [외부 연동]
Cloudflare         →    mailer (Next.js)           →   WordPress
Email Routing           Cloudflare Workers               MariaDB
      ↓                        ↑↓
mailer-worker            Firebase Auth
(SMTP 파싱)              Firestore (DB)
      ↓                        ↓
Cloudflare R2         Resend (외부 발송)
(첨부파일 저장)
```

---

## 서비스별 기술스택

### `mailer` — 웹 애플리케이션 본체

| 구분 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **프레임워크** | Next.js | 16 | 풀스택 웹 앱 (프론트+API 통합) |
| **언어** | TypeScript | 5 | 전체 코드베이스 |
| **런타임** | React | 19 | UI 렌더링 |
| **스타일** | Tailwind CSS | 4 | 반응형 UI 디자인 |
| **에디터** | TipTap / Jodit | 3 | 메일 작성 Rich Text Editor |
| **아이콘** | Lucide React | 1.8 | UI 아이콘 세트 |
| **인증** | Firebase Auth | 12/13 | 로그인, 커스텀 토큰 발행 |
| **기본 DB** | Firestore | (Firebase) | 메일/회원/라벨/연락처 저장 (NoSQL) |
| **보조 DB** | MySQL (MariaDB) | 8 | WordPress 회원 연동 |
| **외부 메일** | Resend | 6 | 외부 도메인 발송 (SMTP relay) |
| **파일 저장** | Cloudflare R2 | — | 첨부파일, 이미지 (S3 호환) |
| **배포** | Cloudflare Workers | — | 서버리스 엣지 배포 |
| **캐시** | OpenNextJS | 1.19 | Next.js → Workers 어댑터 |
| **CLI** | Wrangler | 4.81 | Cloudflare 배포/관리 도구 |
| **관측** | OpenTelemetry | 1.9 | 성능 모니터링 |
| **린트** | ESLint | 9 | 코드 품질 검사 |

### `mailer-worker` — 메일 수신 처리 엔진

| 구분 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **런타임** | Cloudflare Workers | — | 서버리스 엣지 (수신 메일 전용) |
| **언어** | TypeScript | 5 | ES2020 타겟 |
| **메일 파싱** | postal-mime | 2.7 | SMTP 원문 → 구조화 파싱 |
| **저장 DB** | Firestore | (Firebase) | 파싱된 메일 저장 |
| **파일 저장** | Cloudflare R2 | — | 첨부파일 / 인라인 이미지 |
| **인증** | Firebase Service Account | — | JWT 자체 생성 (서버간 인증) |
| **서명** | AWS Sig V4 (직접 구현) | — | R2 업로드 요청 서명 |
| **CLI** | Wrangler | 4.81 | 배포/시크릿 관리 |

---

## 인프라 구성 요약

| 구분 | 서비스 | 역할 |
|------|--------|------|
| **호스팅** | Cloudflare Workers | 전 세계 엣지 서버리스 |
| **파일** | Cloudflare R2 | 첨부파일 오브젝트 스토리지 |
| **메일 라우팅** | Cloudflare Email Routing | 수신 메일 → Worker 전달 |
| **외부 발송** | Resend | 외부 SMTP 릴레이 |
| **인증/DB** | Firebase (Google) | Auth + Firestore |
| **회원 연동** | WordPress + MariaDB | 기존 회원 시스템 연동 |

---

## 멀티테넌트 구조

동일 코드베이스로 2개 도메인 운영:

| 테넌트 | 도메인 | Firebase 프로젝트 | R2 버킷 |
|--------|--------|-------------------|---------|
| MDL | mdl.kr | emailer-71608 | mailer-attachments |
| Ourim | ourim.kr | ourim-mail | ourim-attachments |

---

## 레포지토리 구조

| 레포 | 경로 | 역할 |
|------|------|------|
| `mailer` | `D:\dev\mailer` | 웹 앱 본체 (Next.js) |
| `mailer-worker` | `D:\dev\mailer-worker` | 수신 메일 처리 엔진 |

---

## 한줄 요약

> **Google Firebase(NoSQL DB + 인증) + Cloudflare(서버/파일/메일) + WordPress(기존 회원DB)** 위에서 동작하는 멀티테넌트 사내 메일 그룹웨어. 서버 관리 없이 전량 서버리스로 운영.
