# EmailArchiver ↔ Mailer 연동 스펙

Firebase 프로젝트: **exchange-fwd**

---

## 1. 발송 큐 처리 (신규)

웹앱(Vercel)은 내부망 SMTP에 직접 접근할 수 없으므로, 발송 요청을 Firestore `send_queue`에 저장한다.  
EmailArchiver 에이전트가 이를 폴링하여 SMTP 발송 후 상태를 업데이트한다.

### send_queue 컬렉션 스키마

```
send_queue/{autoId}
  from        string   "양석환 <shy@wm.co.kr>"   (표시용 발신자)
  fromEmail   string   "shy@wm.co.kr"             (순수 이메일)
  to          string   "받는사람@domain.com"       (복수면 ", " 구분)
  cc?         string   "참조@domain.com"
  subject     string
  text        string   (plain text)
  html        string   (트래킹 픽셀 포함된 HTML)
  attachments []
    filename    string
    content     string | null   (base64 인코딩)
    contentType string
  trackId     string   (UUID, 수신확인 트래킹용)
  smtp        object
    host    string
    port    number
    secure  boolean   (true = SSL/465, false = STARTTLS/587)
    user    string
    pass    string
  status      string   "pending" | "sent" | "failed"
  createdAt   string   (ISO 8601)
  sentAt?     string   (ISO 8601, 발송 완료 시)
  error?      string   (실패 사유)
```

### 에이전트 처리 흐름

```
1. send_queue where status == "pending" 폴링 (또는 onSnapshot 리스닝)
2. 각 문서에 대해:
   a. smtp 필드로 nodemailer transporter 생성
   b. sendMail({ from, to, cc, subject, text, html, attachments })
   c. 성공 → status: "sent", sentAt: now() 업데이트
   d. 실패 → status: "failed", error: err.message 업데이트
```

> `attachments[].content`는 base64 문자열이므로 `Buffer.from(content, "base64")`로 변환 후 전달

---

## 2. 수신 메일 저장 (기존 방식 유지)

EmailArchiver가 IMAP으로 메일 수신 후 Firestore `mails` 컬렉션에 저장한다.

### mails 컬렉션 스키마

```
mails/{autoId}
  deliveredTo  string   "shy@wm.co.kr"   ← 수신자 (받은메일함 조회 기준)
  from         string   "보낸사람 <addr@domain>"
  to           string
  cc?          string
  subject      string
  text         string
  html         string
  date         string   (ISO 8601, 원본 메일 Date 헤더)
  createdAt    string   (ISO 8601, Firestore 저장 시각)
  read         boolean  (초기값 false)
  type         없음     (없거나 "inbox" — sent 아니면 받은메일함으로 표시됨)
  attachments  []
    name         string
    contentType? string
    size?        number
    r2Key?       string   (R2 저장 시)
    url?         string
  trash?       boolean
  labels?      string[]
  folder?      string
```

### 웹앱이 저장하는 발신 메일 (참고용)

```
mails/{autoId}
  from         string   "shy@wm.co.kr"
  to           string
  cc?          string
  subject      string
  text         string
  html         string
  date         string   (ISO 8601)
  createdAt    string   (ISO 8601)
  read         true
  type         "sent"   ← 이 필드로 보낸메일함 구분
  attachments  [{ name: string }]
  trackIds?    { "받는사람이메일": "trackId-uuid" }
```

---

## 3. 수신확인 트래킹 (Resend 모드 전용, SMTP 모드는 에이전트 미처리)

```
tracking/{trackId}
  recipient  string   (받는 사람 이메일)
  sentAt     string   (ISO 8601)
  openedAt   string | null
```

SMTP 모드에서는 `send_queue.trackId`만 저장된다.  
에이전트가 발송 성공 후 `tracking/{trackId}` 문서를 생성하면 수신확인 기능도 동작한다.

```
tracking/{trackId}
  recipient  send_queue.to
  sentAt     send_queue.createdAt
  openedAt   null
```

---

## 4. Firebase 접근 정보

- **프로젝트 ID**: `exchange-fwd`
- **컬렉션**: `send_queue`, `mails`, `tracking`
- **Admin SDK 서비스 계정**: Vercel 환경변수 `FIREBASE_ADMIN_*` 참고 (별도 전달)
- **Firestore 규칙**: `send_queue`는 서버(Admin SDK)만 접근 — 클라이언트 규칙 불필요
