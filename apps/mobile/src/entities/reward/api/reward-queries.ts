import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/client";
import type {
  RewardChart,
  RewardLedgerEntry,
  RewardSummary as ApiRewardSummary
} from "@/shared/api/generated/shoply";

type RewardSeriesPoint = {
  period: string;
  label: string;
  expected: number;
  confirmed: number;
  payable: number;
  held: number;
  paid: number;
};

export type RewardChartGroup = "day" | "month";

interface RewardOverview {
  summary: ApiRewardSummary;
  series: RewardSeriesPoint[];
  ledger: Array<{
    id: string;
    title: string;
    state: string;
    amount: number;
  }>;
}

export function useRewardOverview(enabled = true, groupBy: RewardChartGroup = "day") {
  return useQuery<RewardOverview>({
    queryKey: ["rewards", "overview", groupBy],
    enabled,
    queryFn: async () => {
      const [summary, chart, ledger] = await Promise.all([
        apiRequest<ApiRewardSummary>("/users/me/rewards/summary"),
        apiRequest<RewardChart>(`/users/me/rewards/chart?groupBy=${groupBy}`),
        apiRequest<RewardLedgerEntry[]>("/users/me/rewards/ledger?limit=20")
      ]);

      return {
        summary,
        series: chart.series.map((bucket) => ({
          period: bucket.period,
          label: bucket.label,
          expected: finiteAmount(bucket.expectedAmount),
          confirmed: finiteAmount(bucket.confirmedAmount),
          payable: finiteAmount(bucket.payableAmount),
          held: finiteAmount(bucket.heldAmount),
          paid: finiteAmount(bucket.paidAmount)
        })),
        ledger: ledger.map((item) => ({
          id: item.id,
          title: item.activityCode ?? item.sourceType,
          state: item.status,
          amount: finiteAmount(item.amount)
        }))
      };
    },
    retry: 1
  });
}

function finiteAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}
