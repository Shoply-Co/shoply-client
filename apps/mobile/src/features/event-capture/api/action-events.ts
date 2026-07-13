import { Platform } from "react-native";
import Constants from "expo-constants";
import { createMMKV } from "react-native-mmkv";
import { apiRequest } from "@/shared/api/client";

export type ShoplyActionType =
  | "feed_impression"
  | "review_open"
  | "review_dwell_qualified"
  | "review_impression"
  | "review_consumption_milestone"
  | "media_consumption_milestone"
  | "gallery_interaction"
  | "media_complete"
  | "like_added"
  | "like_removed"
  | "save_added"
  | "save_removed"
  | "link_revealed"
  | "link_open_confirmed"
  | "share"
  | "helpful"
  | "not_interested"
  | "hide_creator"
  | "report"
  | "search_submitted"
  | "search_result_impression"
  | "search_result_clicked"
  | "back_to_search"
  | "review_submission_accepted"
  | "review_published"
  | "review_publish_failed"
  | "magazine_impression"
  | "magazine_open"
  | "magazine_subscribed"
  | "magazine_unsubscribed"
  | "magazine_created"
  | "magazine_published"
  | "profile_impression"
  | "subscription_impression";

export interface ShoplyActionEvent {
  eventType: ShoplyActionType;
  targetType: string;
  targetId?: string | null;
  reviewId?: string | null;
  linkId?: string | null;
  sessionId?: string;
  trackingToken?: string | null;
  correlationId?: string | null;
  sourceSurface?: string | null;
  payload?: Record<string, unknown>;
}

type PendingAction = ShoplyActionEvent & {
  sessionId: string;
  clientEventId: string;
  clientSequence: number;
  clientInstanceId: string;
  appVersion: string;
  platform: "ios" | "android" | "web";
  occurredAt: string;
};

const actionStorage = createMMKV({ id: "shoply-action-events" });
const INSTALL_ID_KEY = "install-id-v1";
const PENDING_KEY = "pending-v1";
const SEQUENCE_KEY = "sequence-v1";
const clientInstanceId = persistedInstallId();
const appSessionId = `session-${randomId()}`;
let clientSequence = actionStorage.getNumber(SEQUENCE_KEY) ?? 0;
let flushPromise: Promise<void> | null = null;

export async function captureActionEvents(events: ShoplyActionEvent[]) {
  if (!events.length) return;
  const occurredAt = new Date().toISOString();
  const pending = readPending();
  const next = events.map((event): PendingAction => {
    clientSequence += 1;
    return {
      ...event,
      sessionId: event.sessionId ?? appSessionId,
      clientEventId: actionId(),
      clientSequence,
      clientInstanceId,
      appVersion: Constants.expoConfig?.version ?? "unknown",
      platform: actionPlatform(),
      occurredAt,
      payload: event.payload ?? {}
    };
  });
  actionStorage.set(SEQUENCE_KEY, clientSequence);
  writePending([...pending, ...next].slice(-500));
  await flushPending();
}

export function captureActionEventsQuietly(events: ShoplyActionEvent[]) {
  void captureActionEvents(events).catch(() => undefined);
}

void flushPending().catch(() => undefined);

function actionId() {
  return `action-${randomId()}`;
}

function persistedInstallId() {
  const existing = actionStorage.getString(INSTALL_ID_KEY);
  if (existing) return existing;
  const created = `install-${randomId()}`;
  actionStorage.set(INSTALL_ID_KEY, created);
  return created;
}

function readPending(): PendingAction[] {
  const stored = actionStorage.getString(PENDING_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(events: PendingAction[]) {
  actionStorage.set(PENDING_KEY, JSON.stringify(events));
}

async function flushPending() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    for (;;) {
      const batch = readPending().slice(0, 50);
      if (!batch.length) return;
      await apiRequest("/actions:batch", {
        method: "POST",
        body: JSON.stringify({ events: batch })
      });
      const acknowledged = new Set(batch.map((event) => event.clientEventId));
      writePending(readPending().filter((event) => !acknowledged.has(event.clientEventId)));
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

function actionPlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

function randomId() {
  const cryptoValue = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoValue?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
