import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AmountText, Button, Chip, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useRewardOverview } from "@/entities/reward";
import { useSession } from "@/app/providers/session-provider";
import { formatWon } from "@/shared/lib/money";

type ChartGroup = "day" | "month";
type RewardPoint = {
  period: string;
  label: string;
  expected: number;
  confirmed: number;
  payable: number;
  held: number;
  paid: number;
};

const statusItems = [
  { key: "expectedAmount", label: "예상", tone: "#6D8CFF" },
  { key: "confirmedAmount", label: "확정 예정", tone: "#8B5CF6" },
  { key: "payableAmount", label: "지급 가능", tone: "#16B981" },
  { key: "heldAmount", label: "보류", tone: "#F59E0B" },
  { key: "paidYtdAmount", label: "올해 지급 완료", tone: "#F36C8C" }
] as const;

const chartSegments = [
  { key: "expected", label: "예상", color: "#6D8CFF" },
  { key: "confirmed", label: "확정 예정", color: "#8B5CF6" },
  { key: "payable", label: "지급 가능", color: "#16B981" },
  { key: "held", label: "보류", color: "#F59E0B" },
  { key: "paid", label: "지급 완료", color: "#F36C8C" }
] as const;

export function RewardSummaryPanel() {
  const theme = useShoplyTheme();
  const { user } = useSession();
  const [groupBy, setGroupBy] = useState<ChartGroup>("day");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const {
    data: rewardData,
    isError,
    isFetching,
    refetch
  } = useRewardOverview(Boolean(user), groupBy);

  if (!user) {
    return (
      <StatePanel title="로그인이 필요해요" body="로그인하면 내 활동금 데이터를 불러옵니다." />
    );
  }
  if (!rewardData) {
    if (isFetching) return <RewardLoading />;
    if (isError) {
      return (
        <StatePanel
          title="활동금 데이터를 불러오지 못했어요"
          body="잠시 후 다시 시도해주세요."
          actionLabel="다시 시도"
          onAction={() => void refetch()}
        />
      );
    }
    return <StatePanel title="활동금 데이터가 없어요" body="활동금 내역이 아직 없습니다." />;
  }

  const { summary, series, ledger } = rewardData;
  const selectedPoint =
    series.find((point) => point.period === selectedPeriod) ?? series.at(-1) ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <ShoplyText variant="caption" color="textMuted">
          이번 달 예상 활동금
        </ShoplyText>
        <AmountText>{formatWon(safeAmount(summary.expectedAmount))}</AmountText>
        <ShoplyText variant="caption" color="textMuted">
          예상 금액은 검수와 정산 상태에 따라 달라질 수 있어요.
        </ShoplyText>
      </View>

      <View style={styles.statusGrid}>
        {statusItems.map((item) => (
          <View
            key={item.key}
            style={[styles.statusItem, { backgroundColor: theme.semantic.color.surfaceMuted }]}
          >
            <View style={[styles.statusDot, { backgroundColor: item.tone }]} />
            <View style={styles.statusCopy}>
              <ShoplyText variant="caption" color="textMuted">
                {item.label}
              </ShoplyText>
              <ShoplyText variant="labelLg">{formatWon(safeAmount(summary[item.key]))}</ShoplyText>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.chartSection}>
        <View style={styles.chartHeader}>
          <View>
            <ShoplyText variant="titleMd">활동금 흐름</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              상태별 금액을 겹치지 않게 나눠 보여드려요.
            </ShoplyText>
          </View>
          <View style={styles.segment}>
            <Chip
              label="일별"
              selected={groupBy === "day"}
              onPress={() => {
                setGroupBy("day");
                setSelectedPeriod(null);
              }}
            />
            <Chip
              label="월별"
              selected={groupBy === "month"}
              onPress={() => {
                setGroupBy("month");
                setSelectedPeriod(null);
              }}
            />
          </View>
        </View>

        {selectedPoint ? <PointBreakdown point={selectedPoint} /> : null}
        <RewardChart
          series={series}
          selectedPeriod={selectedPoint?.period ?? null}
          onSelect={setSelectedPeriod}
        />
        <View style={styles.legend}>
          {chartSegments.map((segment) => (
            <View key={segment.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
              <ShoplyText variant="caption" color="textMuted">
                {segment.label}
              </ShoplyText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.ledger}>
        <ShoplyText variant="titleMd">최근 내역</ShoplyText>
        {ledger.length ? (
          ledger.map((item) => (
            <View key={item.id} style={styles.ledgerItem}>
              <View style={styles.ledgerCopy}>
                <ShoplyText variant="labelMd">{item.title}</ShoplyText>
                <ShoplyText variant="caption" color="textMuted">
                  {rewardStateLabel(item.state)}
                </ShoplyText>
              </View>
              <ShoplyText variant="labelLg">{formatWon(item.amount)}</ShoplyText>
            </View>
          ))
        ) : (
          <ShoplyText variant="caption" color="textMuted">
            최근 내역이 아직 없어요.
          </ShoplyText>
        )}
      </View>
    </View>
  );
}

function RewardChart({
  series,
  selectedPeriod,
  onSelect
}: {
  series: RewardPoint[];
  selectedPeriod: string | null;
  onSelect: (period: string) => void;
}) {
  const theme = useShoplyTheme();
  const maximum = useMemo(() => Math.max(1, ...series.map((point) => pointTotal(point))), [series]);

  return (
    <View style={[styles.chart, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartContent}
      >
        {series.map((point) => {
          const total = pointTotal(point);
          const selected = point.period === selectedPeriod;
          const height = total > 0 ? Math.max(8, (total / maximum) * 116) : 3;

          return (
            <Pressable
              key={point.period}
              accessibilityRole="button"
              accessibilityLabel={`${point.label} 활동금 ${formatWon(total)}`}
              onPress={() => {
                onSelect(point.period);
                void Haptics.selectionAsync();
              }}
              style={styles.barColumn}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.stack,
                    {
                      height,
                      opacity: selected ? 1 : 0.76,
                      transform: [{ scaleX: selected ? 1.12 : 1 }]
                    }
                  ]}
                >
                  {chartSegments.map((segment) => {
                    const value = point[segment.key];
                    if (value <= 0 || total <= 0) return null;
                    return (
                      <View
                        key={segment.key}
                        style={{ flex: value / total, backgroundColor: segment.color }}
                      />
                    );
                  })}
                </View>
              </View>
              <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
                {point.label}
              </ShoplyText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PointBreakdown({ point }: { point: RewardPoint }) {
  return (
    <View style={styles.pointBreakdown}>
      <View>
        <ShoplyText variant="labelMd">{point.label}</ShoplyText>
        <ShoplyText variant="caption" color="textMuted">
          표시 합계
        </ShoplyText>
      </View>
      <ShoplyText variant="titleMd">{formatWon(pointTotal(point))}</ShoplyText>
    </View>
  );
}

function RewardLoading() {
  const theme = useShoplyTheme();
  return (
    <View style={styles.loading} accessibilityLabel="리워드 내역 불러오는 중">
      <ActivityIndicator color={theme.semantic.color.primary} />
    </View>
  );
}

function StatePanel({
  title,
  body,
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <ShoplyText variant="titleMd">{title}</ShoplyText>
      <ShoplyText variant="bodyMd" color="textMuted">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

function pointTotal(point: RewardPoint) {
  return [point.expected, point.confirmed, point.payable, point.held, point.paid].reduce(
    (total, value) => total + safeAmount(value),
    0
  );
}

function safeAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function rewardStateLabel(state: string) {
  const labels: Record<string, string> = {
    expected: "예상",
    confirmed: "확정 예정",
    payable: "지급 가능",
    held: "보류",
    paid: "지급 완료",
    expired: "만료",
    recovered: "회수"
  };
  return labels[state] ?? state;
}

const styles = StyleSheet.create({
  wrap: {
    gap: 22,
    padding: 16,
    paddingBottom: 116
  },
  hero: {
    gap: 4
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statusItem: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    minWidth: "47%",
    padding: 12
  },
  statusDot: {
    borderRadius: 999,
    height: 9,
    width: 9
  },
  statusCopy: {
    flex: 1,
    gap: 2
  },
  chartSection: {
    gap: 12
  },
  chartHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  segment: {
    flexDirection: "row",
    gap: 6
  },
  pointBreakdown: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chart: {
    borderRadius: 18,
    height: 184,
    overflow: "hidden"
  },
  chartContent: {
    alignItems: "flex-end",
    gap: 8,
    minWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  barColumn: {
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
    minWidth: 30
  },
  barTrack: {
    height: 120,
    justifyContent: "flex-end"
  },
  stack: {
    borderRadius: 6,
    minHeight: 3,
    overflow: "hidden",
    width: 18
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  legendDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  ledger: {
    gap: 8
  },
  ledgerItem: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingVertical: 8
  },
  ledgerCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360
  }
});
