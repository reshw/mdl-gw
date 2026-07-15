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

export async function sendPushNotification(
  recipientMailEmail: string,
  member: DocumentData,
  mail: { from: string; subject: string; mailId?: string }
): Promise<void> {
  if (member.notifications?.pushEnabled === false) return;

  const tokens: string[] = Array.isArray(member.fcmTokens) ? member.fcmTokens : [];
  if (tokens.length === 0) return;

  const app = resolvePushApp();
  if (!app) return;

  const res = await getMessaging(app).sendEachForMulticast({
    tokens,
    notification: {
      title: mail.from,
      body: mail.subject,
    },
    data: {
      mailEmail: recipientMailEmail,
      ...(mail.mailId ? { mailId: mail.mailId } : {}),
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          threadId: mail.from,
        },
      },
    },
  });

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
