import { useEffect } from "react";
import { create } from "zustand";
import { useSettings } from "../store/settings";

/**
 * "Ask before leaving a match": games register while a round is in progress
 * (progress that would be lost). While any is registered and the setting is
 * on, closing/reloading the tab or following a site link asks first.
 */
interface GuardState {
  active: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
}

export const useLeaveGuard = create<GuardState>((set) => ({
  active: [],
  add: (id) => set((s) => (s.active.includes(id) ? s : { active: [...s.active, id] })),
  remove: (id) => set((s) => ({ active: s.active.filter((x) => x !== id) })),
}));

/** Guard the page while `when` is true (e.g. a round is running). */
export function useGuardWhile(id: string, when: boolean): void {
  useEffect(() => {
    if (!when) return;
    useLeaveGuard.getState().add(id);
    return () => useLeaveGuard.getState().remove(id);
  }, [id, when]);
}

export const LEAVE_MESSAGE = "Leave now? The round in progress will be lost.";

/** Should a click on this link ask first? Only same-site page links count. */
export function linkNeedsConfirm(href: string | null, target: string | null, currentPath: string): boolean {
  if (!href || target === "_blank") return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  return href.split("#")[0] !== currentPath;
}

/** Install the tab-close and link listeners (call once, in App). */
export function useLeaveGuardListeners(): void {
  const guarded = useLeaveGuard((s) => s.active.length > 0);
  const enabled = useSettings((s) => s.confirmLeave);
  const on = guarded && enabled;

  useEffect(() => {
    if (!on) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // browsers show their own wording
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (!linkNeedsConfirm(a.getAttribute("href"), a.getAttribute("target"), window.location.pathname)) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [on]);
}
