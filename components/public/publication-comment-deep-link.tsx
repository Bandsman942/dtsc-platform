"use client";

import { useEffect } from "react";

export function PublicationCommentDeepLink({ commentId }: { commentId?: string | null }) {
  useEffect(() => {
    const targetCommentId = typeof commentId === "string" ? commentId : "";
    if (!targetCommentId) return;

    let attempts = 0;
    let timer = 0;

    function focusComment() {
      const target = document.querySelector<HTMLElement>(`[data-publication-comment-id="${CSS.escape(targetCommentId)}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("dtsc-message-focus-pulse");
        window.setTimeout(() => target.classList.remove("dtsc-message-focus-pulse"), 1800);
        return;
      }

      if (attempts === 0) {
        const commentsButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
          /commentaire/i.test(button.textContent || ""),
        );
        commentsButton?.click();
      }

      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(focusComment, 120);
    }

    timer = window.setTimeout(focusComment, 80);
    return () => window.clearTimeout(timer);
  }, [commentId]);

  return null;
}
