# 작업 요청서 — mailer (Vercel) 발송 연동

## 배경 및 제약

| 제약 | 이유 |
|------|------|
| Vercel에서 내부 SMTP 직접 발송 불가 | SMTP 서버가 사내망 전용 |
| Vercel에서 OneDrive 직접 업로드 불가 | OneDrive 인증 토큰이 사내 PC에만 존재 |

→ **Cloudflare R2를 임시 스테이징으로, Firebase Firestore를 큐로 활용.**
Vercel은 R2 업로드 + Firestore 쓰기만 담당. 나머지는 사내 PC 데몬이 처리.

---

## 전체 흐름

```
[mailer / Vercel]
  ① 첨부파일 → Cloudflare R2 업로드 (임시)
                버킷: mail-attachments
                키:   mailAttachments/{jobId}/{filename}
  ② mailQueue 문서 생성 (r2Key 참조, status: 'pending')

[Cloudflare R2]  ← 임시 보관소 (발송 완료 후 데몬이 자동 삭제)

[EmailArchiver 데몬 / 사내 PC]
  ③ mailQueue onSnapshot → pending 감지
  ④ R2에서 첨부파일 다운로드
  ⑤ OneDrive 영구 보관
     경로: EmailArchives/{from}/MailQueue/{yyyy}/{mm}/{dd}/{jobId}/{filename}
  ⑥ SMTP 발송 (첨부파일 inline 첨부)
  ⑦ R2 임시파일 삭제
  ⑧ mailQueue 문서 → status: 'sent', onedrivUrl 기록
```

---

## mailer 구현 사항

### 공통 설정 (환경변수)

```
CF_ACCOUNT_ID=         # Cloudflare 계정 ID
CF_R2_ACCESS_KEY_ID=   # R2 API 토큰 (Access Key ID)
CF_R2_SECRET_ACCESS_KEY=
CF_R2_BUCKET=mail-attachments
```

R2 버킷 생성 후 API 토큰 발급 시 권한: **Object Read & Write** (해당 버킷 한정)

---

### 1단계 — 첨부파일을 R2에 업로드

R2는 S3 호환 API 사용 (`@aws-sdk/client-s3`).

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  },
});

const jobId = uuid();

const uploadedAttachments = await Promise.all(
  files.map(async (file) => {
    const r2Key = `mailAttachments/${jobId}/${file.name}`;
    await r2.send(new PutObjectCommand({
      Bucket:      process.env.CF_R2_BUCKET,
      Key:         r2Key,
      Body:        await file.arrayBuffer(),   // or Buffer
      ContentType: file.type,
    }));
    return {
      filename:    file.name,
      r2Key,                   // Firestore에는 키만 저장 (파일 본문 X)
      contentType: file.type,
      size:        file.size,
    };
  })
);
```

---

### 2단계 — mailQueue 문서 추가

```js
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const db = getFirestore();

await addDoc(collection(db, 'mailQueue'), {
  from:        '발신자@wm.kr',        // 반드시 @wm.kr (테넌트 메일주소)
  to:          '수신자@example.com',
  subject:     '제목',
  html:        '<p>본문</p>',
  text:        '본문 텍스트',          // 선택
  cc:          'cc@example.com',      // 선택
  bcc:         'bcc@example.com',     // 선택
  attachments: uploadedAttachments,   // 첨부 없으면 [] 또는 생략
  status:      'pending',
  createdAt:   new Date().toISOString(),
});
```

---

## status 흐름

| 값 | 의미 |
|----|------|
| `pending` | 발송 대기 |
| `processing` | 데몬 처리 중 |
| `sent` | 발송 완료. `sentAt`, `attachments[].onedrivUrl` 추가됨 |
| `failed` | 실패. `error`, `failedAt` 확인. `status`를 `pending`으로 바꾸면 재시도 |
| `skipped` | `from`이 `@wm.kr` 아님 |

---

## 주의사항

- `from`이 `@wm.kr`이 아니면 발송하지 않음
- R2 버킷은 **Public 접근 차단** 설정 권장 (데몬은 API 키로 접근하므로 퍼블릭 불필요)
- 데몬 다운 중 쌓인 `pending` 문서는 재기동 시 일괄 처리됨
- 발송 완료 후 `attachments[].onedrivUrl`로 OneDrive 저장 경로 확인 가능
