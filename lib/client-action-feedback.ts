import type { ToastNotice } from "@/lib/client-toast";

type HttpMessageBody = { message?: unknown; error?: unknown; code?: unknown; requestId?: unknown };

/** Failure is determined from HTTP status, never guessed from translated wording. */
export function actionFeedback(
  ok: boolean,
  body: HttpMessageBody | null | undefined,
  options: { success: string; failure: string },
): ToastNotice {
  const serverMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const message = ok ? options.success : serverMessage || options.failure;
  return { description: message, tone: ok ? "success" : "error" };
}
