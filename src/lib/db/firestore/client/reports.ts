'use client';

import { callApi } from './api';

/**
 * Reports (檢舉) — App Store guideline 1.2 requires a way to flag
 * objectionable content and abusive users. They go through the server, the
 * same calls the apps make: a card through POST /api/v1/cards/{id}/report
 * (only the server knows an anonymous card's author), a person or a message
 * through POST /api/v1/reports. The server keeps a copy of what was
 * reported, so deleting it afterwards erases no evidence; moderation reads
 * them with the Admin SDK (`npm run moderation -- list`).
 */
export type ReportTargetType = 'card' | 'user' | 'message';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'self_harm',
  'violence',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Mirrors REPORT_DETAIL_MAX in lib/api/v1/schemas — keep the two in sync. */
export const REPORT_DETAIL_MAX = 1000;

export interface ReportInput {
  targetType: ReportTargetType;
  /** Card id, user id, or message id. */
  targetId: string;
  /** Where it happened: the conversation id, for a message. */
  contextId?: string;
  reason: ReportReason;
  detail?: string;
}

export async function submitReport(input: ReportInput): Promise<void> {
  const detail = (input.detail ?? '').trim().slice(0, REPORT_DETAIL_MAX);
  if (input.targetType === 'card') {
    await callApi(`/api/v1/cards/${encodeURIComponent(input.targetId)}/report`, {
      method: 'POST',
      body: { reason: input.reason, detail },
    });
    return;
  }
  await callApi('/api/v1/reports', {
    method: 'POST',
    body: {
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.contextId ? { conversationId: input.contextId } : {}),
      reason: input.reason,
      detail,
    },
  });
}
