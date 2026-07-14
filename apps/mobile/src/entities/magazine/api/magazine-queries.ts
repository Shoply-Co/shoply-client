import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/client";
import { listPublicProfileMagazines } from "@/shared/api/generated/shoply";
import type {
  MagazineGenerationJob,
  MagazineCustomSource,
  MagazineIssue,
  MagazineSummary
} from "@/shared/api/generated/shoply";
import { isMagazineGeneratingStatus } from "../model/status";

export const magazineKeys = {
  all: ["magazines"] as const,
  mine: () => [...magazineKeys.all, "mine"] as const,
  profile: (userId: string) => [...magazineKeys.all, "profile", userId] as const,
  subscriptions: () => [...magazineKeys.all, "subscriptions"] as const,
  discover: () => [...magazineKeys.all, "discover"] as const,
  issue: (issueId: string) => [...magazineKeys.all, "issue", issueId] as const,
  job: (jobId: string) => [...magazineKeys.all, "job", jobId] as const,
  sources: () => [...magazineKeys.all, "custom-sources"] as const
};

export function useMyMagazines(enabled = true) {
  return useQuery({
    queryKey: magazineKeys.mine(),
    queryFn: () => apiRequest<MagazineSummary[]>("/magazines/mine"),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
}

export function usePublicProfileMagazines(userId?: string, enabled = true) {
  return useQuery({
    queryKey: magazineKeys.profile(userId ?? "missing"),
    queryFn: () => {
      if (!userId) throw new Error("userId is required");
      return listPublicProfileMagazines(userId).then((response) => response.data.data);
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
}

export function useSubscribedMagazines() {
  return useQuery({
    queryKey: magazineKeys.subscriptions(),
    queryFn: () => apiRequest<MagazineSummary[]>("/magazines/subscriptions?limit=20"),
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
}

export function useDiscoverMagazines() {
  return useQuery({
    queryKey: magazineKeys.discover(),
    queryFn: () => apiRequest<MagazineSummary[]>("/magazines/discover?limit=30"),
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
}

export function useMagazineIssue(issueId?: string) {
  return useQuery({
    queryKey: magazineKeys.issue(issueId ?? "missing"),
    queryFn: () => {
      if (!issueId) throw new Error("issueId is required");
      return apiRequest<MagazineIssue>(`/magazines/${issueId}`);
    },
    enabled: Boolean(issueId),
    refetchInterval: (query) =>
      isMagazineGeneratingStatus(query.state.data?.status) ? 1500 : false,
    retry: 1
  });
}

export function useMagazineGenerationJob(jobId?: string | null) {
  return useQuery({
    queryKey: magazineKeys.job(jobId ?? "missing"),
    queryFn: () => {
      if (!jobId) throw new Error("jobId is required");
      return apiRequest<MagazineGenerationJob>(`/magazine-generation-jobs/${jobId}`);
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["ready", "partial", "failed"].includes(status) ? false : 1500;
    },
    retry: 1
  });
}

export function useCustomMagazineSources(enabled = true) {
  return useQuery({
    queryKey: magazineKeys.sources(),
    queryFn: () => apiRequest<MagazineCustomSource[]>("/magazines/custom-sources"),
    enabled,
    staleTime: 60 * 1000,
    retry: 1
  });
}
