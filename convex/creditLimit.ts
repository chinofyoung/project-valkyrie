import { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { DEFAULT_CREDIT_LIMIT, SAFETY_CAP, WARNING_THRESHOLD } from "./constants";

// NOTE: This duplicates some logic from getCreditStatus in users.ts.
// getCreditStatus runs in QueryCtx (reactive, for UI), while this runs in
// ActionCtx (for gating actions). Convex's model requires both paths.

export async function checkCreditLimit(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{ allowed: boolean; used: number; effectiveLimit: number; warning: boolean }> {
  const user: any = await ctx.runQuery(internal.users.getById, { userId });
  const limit = user?.dailyCreditLimit ?? DEFAULT_CREDIT_LIMIT;
  const effectiveLimit = limit === 0 ? SAFETY_CAP : limit;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayTimestamp = startOfDay.getTime();

  const [analysesCount, chatCount] = await Promise.all([
    ctx.runQuery(internal.aiAnalyses.countSince, {
      userId,
      since: todayTimestamp,
    }),
    ctx.runQuery(internal.chatMessages.countAssistantSince, {
      userId,
      since: todayTimestamp,
    }),
  ]);

  const used = (analysesCount as number) + (chatCount as number);
  const allowed = used < effectiveLimit;
  const warning = allowed && (effectiveLimit - used) <= WARNING_THRESHOLD;

  return { allowed, used, effectiveLimit, warning };
}
