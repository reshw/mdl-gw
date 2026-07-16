import { adminDb } from "@/lib/firebase-admin";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { FieldValue, DocumentData } from "firebase-admin/firestore";

// FCM 발송에 쓸 admin 앱.
// iOS 앱의 기본(default) FirebaseApp = 푸시 전용 중앙 프로젝트인데,
// 배포(테넌트)의 Firebase 프로젝트가 중앙 푸시 프로젝트와 다르면
// FIREBASE_PUSH_SERVICE_ACCOUNT(중앙 프로젝트 서비스계정 JSON)를 설정해야 한다.
// 같은 프로젝트면 미설정 — 기존 admin 앱을 그대로 쓴다.
let pushApp: App | null | undefined;

function resolvePushApp(): App | null {
  if (pushApp !== undefined) return pushApp;
  const json = process.env.FIREBASE_PUSH_SERVICE_ACCOUNT;
  if (json) {
    const existing = getApps().find((a) => a.name === "push");
    pushApp = existing ?? initializeApp({ credential: cert(JSON.parse(json)) }, "push");
  } else {
    pushApp = getApps()[0] ?? null;
  }
  return pushApp;
}

// 알림 본문 미리보기: HTML 태그/개행 제거 후 앞부분만 노출
function buildPreview(text: string | undefined, maxLen = 100): string {
  if (!text) return "";
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}

export async function sendPushNotification(
  recipientMailEmail: string,
  member: DocumentData,
  mail: { from: string; subject: string; mailId?: string; text?: string }
): Promise<void> {
  if (member.notifications?.pushEnabled === false) {
    console.log(`[push] ${recipientMailEmail}: pushEnabled=false, 스킵`);
    return;
  }

  const tokens: string[] = Array.isArray(member.fcmTokens) ? member.fcmTokens : [];
  if (tokens.length === 0) {
    console.log(`[push] ${recipientMailEmail}: 등록된 fcmTokens 없음, 스킵`);
    return;
  }

  const app = resolvePushApp();
  if (!app) {
    console.log(`[push] ${recipientMailEmail}: pushApp 없음(FIREBASE_PUSH_SERVICE_ACCOUNT 미설정 + admin 앱도 없음), 스킵`);
    return;
  }
  console.log(`[push] ${recipientMailEmail}: app=${app.name}/${app.options.projectId} tokens=${tokens.length}`);

  // iOS 전용 앱이라 top-level notification 대신 apns.payload.aps.alert로 title/subtitle/body를 직접 구성.
  // title(굵게) = 메일 제목(누가 보냈든 결국 가장 중요한 정보), subtitle = 발신자, body = 수신 계정 + 본문 미리보기.
  const preview = buildPreview(mail.text);
  const body = preview ? `수신: ${recipientMailEmail}\n${preview}` : `수신: ${recipientMailEmail}`;
  const res = await getMessaging(app).sendEachForMulticast({
    tokens,
    data: {
      mailEmail: recipientMailEmail,
      ...(mail.mailId ? { mailId: mail.mailId } : {}),
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: mail.subject,
            subtitle: mail.from,
            body,
          },
          sound: "default",
          threadId: mail.from,
        },
      },
    },
  });

  console.log(
    `[push] ${recipientMailEmail}: 성공=${res.successCount} 실패=${res.failureCount} ` +
      res.responses.map((r, i) => `token${i}:${r.success ? "ok" : (r.error?.code ?? r.error?.message ?? "unknown")}`).join(", ")
  );

  // 만료/삭제된 토큰 정리
  const invalid: string[] = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code ?? "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument"
    ) {
      invalid.push(tokens[i]);
    }
  });
  if (invalid.length > 0) {
    await adminDb
      .collection("members")
      .doc(recipientMailEmail)
      .set({ fcmTokens: FieldValue.arrayRemove(...invalid) }, { merge: true })
      .catch(() => {});
  }
}
