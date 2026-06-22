import { getPersonalDb } from "@/lib/personal-db";
import {
  collection, query, where, onSnapshot, orderBy,
  addDoc, deleteDoc, doc, updateDoc, getDocs,
  type Unsubscribe,
} from "firebase/firestore";
import { addLabelToMail } from "@/lib/labels";
import { moveToTrash, markAsRead } from "@/lib/mail";
import type { Mail } from "@/lib/mail";

export type ConditionField = "from" | "to" | "subject" | "text";
export type ConditionOperator = "contains" | "equals" | "startsWith" | "endsWith";

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

export type ActionType = "addLabel" | "markRead" | "moveToTrash" | "setFolder";

export interface RuleAction {
  type: ActionType;
  labelId?: string;
  folder?: string;
}

export interface MailRule {
  id: string;
  userEmail: string;
  name: string;
  enabled: boolean;
  conditionLogic: "AND" | "OR";
  conditions: RuleCondition[];
  actions: RuleAction[];
  order: number;
  createdAt: string;
}

export function subscribeRules(userEmail: string, callback: (rules: MailRule[]) => void): Unsubscribe {
  const q = query(
    collection(getPersonalDb(), "rules"),
    where("userEmail", "==", userEmail),
    orderBy("order", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MailRule)));
  });
}

export async function createRule(userEmail: string, rule: Omit<MailRule, "id" | "userEmail" | "createdAt" | "order">): Promise<string> {
  // 현재 최대 order 파악
  const snap = await getDocs(query(collection(getPersonalDb(), "rules"), where("userEmail", "==", userEmail)));
  const maxOrder = snap.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), 0);
  const ref = await addDoc(collection(getPersonalDb(), "rules"), {
    ...rule,
    userEmail,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateRule(ruleId: string, updates: Partial<Omit<MailRule, "id" | "userEmail" | "createdAt">>): Promise<void> {
  await updateDoc(doc(getPersonalDb(), "rules", ruleId), updates as Record<string, unknown>);
}

export async function deleteRule(ruleId: string): Promise<void> {
  await deleteDoc(doc(getPersonalDb(), "rules", ruleId));
}

function matchCondition(mail: Mail, cond: RuleCondition): boolean {
  const raw = (mail[cond.field as keyof Mail] as string | undefined) ?? "";
  const haystack = raw.toLowerCase();
  const needle = cond.value.toLowerCase();
  switch (cond.operator) {
    case "contains":    return haystack.includes(needle);
    case "equals":      return haystack === needle;
    case "startsWith":  return haystack.startsWith(needle);
    case "endsWith":    return haystack.endsWith(needle);
  }
}

function matchesRule(mail: Mail, rule: MailRule): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;
  if (rule.conditionLogic === "AND") return rule.conditions.every((c) => matchCondition(mail, c));
  return rule.conditions.some((c) => matchCondition(mail, c));
}

export async function applyRulesToMail(mail: Mail, rules: MailRule[], userEmail: string): Promise<void> {
  for (const rule of rules) {
    if (!matchesRule(mail, rule)) continue;
    for (const action of rule.actions) {
      if (action.type === "addLabel" && action.labelId) {
        await addLabelToMail(mail.id, action.labelId);
      } else if (action.type === "markRead") {
        await markAsRead(mail, userEmail);
      } else if (action.type === "moveToTrash") {
        await moveToTrash(mail.id, userEmail);
      }
    }
  }
  // 적용 완료 표시
  await updateDoc(doc(getPersonalDb(), "mails", mail.id), { rulesApplied: true });
}

// 소급 적용: 기존 메일 전체에 규칙 실행
export async function applyRulesToAllMails(userEmail: string, rules: MailRule[]): Promise<number> {
  const snap = await getDocs(
    query(collection(getPersonalDb(), "mails"), where("deliveredTo", "==", userEmail))
  );
  let count = 0;
  for (const d of snap.docs) {
    const mail = { id: d.id, ...d.data() } as Mail & { rulesApplied?: boolean };
    if (mail.rulesApplied) continue;
    await applyRulesToMail(mail, rules, userEmail);
    count++;
  }
  return count;
}
