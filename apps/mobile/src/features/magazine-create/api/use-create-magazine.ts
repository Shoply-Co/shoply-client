import { useMutation, useQueryClient } from "@tanstack/react-query";
import { magazineKeys } from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { apiRequest } from "@/shared/api/client";
import type { MagazineGenerationAccepted } from "@/shared/api/generated/shoply";

export function useCreateMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cadence: "weekly" | "monthly" = "monthly") =>
      apiRequest<MagazineGenerationAccepted>("/magazines/custom", {
        method: "POST",
        body: JSON.stringify({ cadence })
      }),
    onSuccess: (result) => {
      captureActionEventsQuietly([{
        eventType: "magazine_created",
        targetType: "magazine_issue",
        targetId: result.issueId,
        sourceSurface: "magazine_home",
        payload: { status: result.status }
      }]);
      void queryClient.invalidateQueries({ queryKey: magazineKeys.mine() });
    }
  });
}
