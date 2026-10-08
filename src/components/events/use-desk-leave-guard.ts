"use client";

import { useEffect } from "react";

export function confirmDeskNavigation() {
  const guards = document.querySelectorAll<HTMLElement>("[data-desk-unsaved]");
  if (!guards.length) return true;
  if ([...guards].some((guard) => guard.dataset.deskSaving === "true")) {
    window.alert("A save is still in progress. Wait for it to finish before switching views.");
    return false;
  }
  return window.confirm("You have unsaved timing or order changes. Leave this view and discard them?");
}

export function useDeskLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    // Capture app and sidebar links before Next handles client-side navigation.
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const next = new URL(anchor.href);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (!confirmDeskNavigation()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [active]);
}
