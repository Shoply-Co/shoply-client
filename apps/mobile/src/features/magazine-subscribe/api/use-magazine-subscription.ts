import { useMutation, useQueryClient } from "@tanstack/react-query";
import { magazineKeys } from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { apiRequest } from "@/shared/api/client";

export function useMagazineSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, subscribed }: { seriesId: string; subscribed: boolean }) =>
      apiRequest<void>(`/magazine-subscriptions/${seriesId}`, {
        method: subscribed ? "DELETE" : "PUT"
      }),
    onSuccess: (_data, variables) => {
      captureActionEventsQuietly([{
        eventType: variables.subscribed ? "magazine_unsubscribed" : "magazine_subscribed",
        targetType: "magazine_series",
        targetId: variables.seriesId,
        sourceSurface: "magazine_detail"
      }]);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: magazineKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["users", "me", "picks"] })
      ]);
    }
  });
}
