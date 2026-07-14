import { useMutation, useQueryClient } from "@tanstack/react-query";
import { magazineKeys } from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { createCustomMagazine, type MagazineLayout } from "@/shared/api/generated/shoply";

export function useCreateMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (layout: MagazineLayout) => {
      const response = await createCustomMagazine({ layout });
      return response.data.data;
    },
    onSuccess: (issue) => {
      captureActionEventsQuietly([{
        eventType: "magazine_created",
        targetType: "magazine_issue",
        targetId: issue.id,
        sourceSurface: "magazine_home",
        payload: { status: issue.status, layout: issue.baseLayout, creationMode: "blank_template" }
      }]);
      void queryClient.invalidateQueries({ queryKey: magazineKeys.mine() });
    }
  });
}
