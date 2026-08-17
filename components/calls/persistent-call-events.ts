export const PERSISTENT_CALL_HANDOFF_EVENT = "dtsc:persistent-call-handoff";
export const PERSISTENT_CALL_RESTORE_EVENT = "dtsc:persistent-call-restore";
const PERSISTENT_CALL_HANDOFF_TIMEOUT_MS = 5000;

export type PersistentCallHandoffDetail = {
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

export function requestPersistentCallHandoff() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PERSISTENT_CALL_HANDOFF_BROWSER_REQUIRED"));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("PERSISTENT_CALL_HANDOFF_TIMEOUT"));
    }, PERSISTENT_CALL_HANDOFF_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };

    window.dispatchEvent(
      new CustomEvent<PersistentCallHandoffDetail>(PERSISTENT_CALL_HANDOFF_EVENT, {
        detail: {
          resolve: () => finish(resolve),
          reject: (reason) => finish(() => reject(reason)),
        },
      }),
    );
  });
}

export function requestPersistentCallRestore() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PERSISTENT_CALL_RESTORE_EVENT));
  }
}
