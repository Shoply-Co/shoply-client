import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { magazineKeys } from "@/entities/magazine";
import { ensureCurrentAutomaticMagazines } from "@/shared/api/generated/shoply";
import { millisecondsUntilNextMagazineBoundary } from "../lib/next-magazine-boundary";

const FOREGROUND_THROTTLE_MS = 30_000;

interface Options {
  enabled: boolean;
  userId?: string;
}

export function useEnsureAutomaticMagazinesOnVisit({ enabled, userId }: Options) {
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const lastEnsureAtRef = useRef(0);

  const ensure = useCallback(async (force = false) => {
    if (!enabled || !userId || inFlightRef.current) return;
    const now = Date.now();
    if (!force && now - lastEnsureAtRef.current < FOREGROUND_THROTTLE_MS) return;

    inFlightRef.current = true;
    lastEnsureAtRef.current = now;
    try {
      const response = await ensureCurrentAutomaticMagazines();
      const issues = response.data.data.issues;
      await queryClient.invalidateQueries({ queryKey: magazineKeys.mine() });
      await Promise.all(issues.map((issue) =>
        queryClient.invalidateQueries({ queryKey: magazineKeys.issue(issue.issueId) })
      ));
    } catch {
      // App bootstrap must remain usable when automatic magazine generation is unavailable.
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, queryClient, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    lastEnsureAtRef.current = 0;
    void ensure(true);

    let disposed = false;
    let boundaryTimer: ReturnType<typeof setTimeout>;
    const scheduleBoundary = () => {
      if (disposed) return;
      boundaryTimer = setTimeout(() => {
        void ensure(true).finally(scheduleBoundary);
      }, millisecondsUntilNextMagazineBoundary());
    };
    scheduleBoundary();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void ensure();
    });

    return () => {
      disposed = true;
      clearTimeout(boundaryTimer);
      appStateSubscription.remove();
    };
  }, [enabled, ensure, userId]);
}
