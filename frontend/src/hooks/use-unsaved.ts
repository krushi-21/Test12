import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

export function useUnsaved(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const allowNavigation = () => {
    dirtyRef.current = false;
  };
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !window.confirm("Leave without saving your changes?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  return allowNavigation;
}
