import { useMutation, useQueryClient } from "@tanstack/react-query";
import { magazineKeys } from "@/entities/magazine";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { apiRequest } from "@/shared/api/client";
import type {
  MagazineIssue,
  ReorderMagazineItemsRequest,
  UpdateMagazineRequest,
  UpsertMagazineDealRequest
} from "@/shared/api/generated/shoply";
import { deleteMagazineIssue, fillCustomMagazineSlot } from "@/shared/api/generated/shoply";

function syncIssue(queryClient: ReturnType<typeof useQueryClient>, issue: MagazineIssue) {
  queryClient.setQueryData(magazineKeys.issue(issue.id), issue);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: magazineKeys.mine() }),
    queryClient.invalidateQueries({ queryKey: magazineKeys.discover() })
  ]);
}

export function useUpdateMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, patch }: { issueId: string; patch: UpdateMagazineRequest }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function useUpdateMagazineBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, blockId, text }: { issueId: string; blockId: string; text: string }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/blocks/${blockId}`, {
        method: "PATCH",
        body: JSON.stringify({ text })
      }),
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function useRegenerateMagazineBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, blockId }: { issueId: string; blockId: string }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/blocks/${blockId}/regenerate`, {
        method: "POST"
      }),
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function useFillMagazineSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issueId,
      slotId,
      reviewId
    }: {
      issueId: string;
      slotId: string;
      reviewId: string;
    }) => {
      const response = await fillCustomMagazineSlot(issueId, slotId, { reviewId });
      return response.data.data;
    },
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function useUpdateMagazineItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      issueId,
      items
    }: {
      issueId: string;
      items: ReorderMagazineItemsRequest["items"];
    }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/items`, {
        method: "PUT",
        body: JSON.stringify({ items })
      }),
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function useUpsertMagazineDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      issueId,
      dealId,
      deal
    }: {
      issueId: string;
      dealId?: string;
      deal: UpsertMagazineDealRequest;
    }) =>
      apiRequest<MagazineIssue>(
        dealId ? `/magazines/${issueId}/deals/${dealId}` : `/magazines/${issueId}/deals`,
        {
          method: dealId ? "PUT" : "POST",
          body: JSON.stringify(deal)
        }
      ),
    onSuccess: (result) => syncIssue(queryClient, result)
  });
}

export function usePublishMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/publish`, { method: "POST" }),
    onSuccess: (issue) => {
      captureActionEventsQuietly([
        {
          eventType: "magazine_published",
          targetType: "magazine_issue",
          targetId: issue.id,
          sourceSurface: "magazine_editor"
        }
      ]);
      return syncIssue(queryClient, issue);
    }
  });
}

export function useDeleteMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) => {
      await deleteMagazineIssue(issueId);
    },
    onSuccess: (_result, issueId) => {
      queryClient.removeQueries({ queryKey: magazineKeys.issue(issueId) });
      return queryClient.invalidateQueries({ queryKey: magazineKeys.all });
    }
  });
}
