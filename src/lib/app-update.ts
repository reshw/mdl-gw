import { getMessaging } from "firebase-admin/messaging";
import "@/lib/firebase-admin";

// mailer-and(안드로이드) 앱이 시작 시 구독하는 FCM 토픽.
// data-only 메시지만 보낸다(top-level notification 블록 금지) — 넣으면 앱이 백그라운드일 때
// 시스템이 기본 알림을 그려버려서, 탭 시 Play 스토어 링크로 보내는
// MailerMessagingService.showUpdateNotification()의 커스텀 처리가 무시된다.
const TOPIC = "app_updates";
const DEFAULT_URL = "https://play.google.com/store/apps/details?id=kr.mdl.mailer";

export async function sendAppUpdateNotification(params: {
  title: string;
  body: string;
  url?: string;
}): Promise<string> {
  return getMessaging().send({
    topic: TOPIC,
    data: {
      type: "update",
      title: params.title,
      body: params.body,
      url: params.url ?? DEFAULT_URL,
    },
    android: { priority: "high" },
  });
}
