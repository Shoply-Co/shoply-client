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

function invalidateIssue(queryClient: ReturnType<typeof useQueryClient>, issueId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: magazineKeys.issue(issueId) }),
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
    onSuccess: (_result, variables) => invalidateIssue(queryClient, variables.issueId)
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
    onSuccess: (_result, variables) => invalidateIssue(queryClient, variables.issueId)
  });
}

export function useRegenerateMagazineBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, blockId }: { issueId: string; blockId: string }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/blocks/${blockId}/regenerate`, {
        method: "POST"
      }),
    onSuccess: (_result, variables) => invalidateIssue(queryClient, variables.issueId)
  });
}

export function useUpdateMagazineItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, items }: { issueId: string; items: ReorderMagazineItemsRequest["items"] }) =>
      apiRequest<MagazineIssue>(`/magazines/${issueId}/items`, {
        method: "PUT",
        body: JSON.stringify({ items })
      }),
    onSuccess: (_result, variables) => invalidateIssue(queryClient, variables.issueId)
  });
}

export function useUpsertMagazineDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, dealId, deal }: { issueId: string; dealId?: string; deal: UpsertMagazineDealRequest }) =>
      apiRequest<MagazineIssue>(dealId ? `/magazines/${issueId}/deals/${dealId}` : `/magazines/${issueId}/deals`, {
        method: dealId ? "PUT" : "POST",
        body: JSON.stringify(deal)
      }),
    onSuccess: (_result, variables) => invalidateIssue(queryClient, variables.issueId)
  });
}

export function usePublishMagazine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => apiRequest<MagazineIssue>(`/magazines/${issueId}/publish`, { method: "POST" }),
    onSuccess: (issue) => {
      captureActionEventsQuietly([{
        eventType: "magazine_published",
        targetType: "magazine_issue",
        targetId: issue.id,
        sourceSurface: "magazine_editor"
      }]);
      return invalidateIssue(queryClient, issue.id);
    }
  });
}
