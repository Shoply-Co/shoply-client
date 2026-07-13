import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowDown, ArrowUp, Edit3, RefreshCw, Scan, Trash2 } from "lucide-react-native";
import { ReactNode, useMemo } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue
} from "react-native-reanimated";
import { Button, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import type {
  MagazineDeal,
  MagazineEditorialBlock,
  MagazineIssue,
  MagazineItem,
  MagazineLayout,
  MagazineSection
} from "@/entities/magazine";
import { DisclosureBadge } from "@/entities/review";
import type { DisclosureState } from "@/entities/review/model/types";
import { ShoplySMonogram, ShoplyWordmark } from "@/shared/ui/brand";

const SCREEN_WIDTH = Dimensions.get("window").width;
const WORDMARK_DISTANCE = SCREEN_WIDTH * 0.25;

interface MagazineIssueViewerProps {
  issue: MagazineIssue;
  onEditBlock?: (block: MagazineEditorialBlock) => void;
  onRegenerateBlock?: (block: MagazineEditorialBlock) => void;
  regeneratingBlockId?: string | null;
  onChangeCrop?: (itemId: string, crop: { x: number; y: number; zoom: number }) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
}

export function MagazineIssueViewer({
  issue,
  onEditBlock,
  onRegenerateBlock,
  regeneratingBlockId,
  onChangeCrop,
  onMoveItem,
  onRemoveItem,
  header,
  footer
}: MagazineIssueViewerProps) {
  const theme = useShoplyTheme();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const coverItem = issue.sections.flatMap((section) => section.items)[0];
  const coverImage = coverItem?.facts?.mediaUrl ?? null;
  const dealsByItem = useMemo(() => {
    const map = new Map<string, MagazineDeal>();
    for (const deal of issue.deals) if (deal.itemId) map.set(deal.itemId, deal);
    return map;
  }, [issue.deals]);

  return (
    <Animated.ScrollView
      accessibilityLabel={`${issue.issueLabel} 매거진`}
      contentContainerStyle={[styles.scrollContent, { backgroundColor: theme.semantic.color.background }]}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {header}
      <MagazineCover issue={issue} imageUrl={coverImage} />
      <View style={styles.disclosureRow}>
        <ShoplyText variant="caption" color="textMuted">
          {issue.revision.aiDisclosure}
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted">
          {issue.status === "published" ? "PUBLISHED" : "PRIVATE DRAFT"}
        </ShoplyText>
      </View>

      {issue.revision.editorLetter ? (
        <View style={[styles.editorLetter, { borderColor: theme.semantic.color.borderStrong }]}>
          <ShoplyText variant="caption" color="primary" style={styles.uppercase}>
            EDITOR&apos;S LETTER
          </ShoplyText>
          <ShoplyText variant="bodyLg" style={styles.serifBody}>
            {issue.revision.editorLetter}
          </ShoplyText>
        </View>
      ) : null}

      {issue.sections.map((section, index) => {
        const layout = section.layoutOverride ?? issue.baseLayout;
        return (
          <View key={section.id}>
            <WordmarkBoundary index={index} scrollY={scrollY} />
            <MagazineSectionView
              section={section}
              layout={layout}
              dealsByItem={dealsByItem}
              canEdit={issue.isOwner && issue.issueType === "custom"}
              onEditBlock={onEditBlock}
              onRegenerateBlock={onRegenerateBlock}
              regeneratingBlockId={regeneratingBlockId}
              onChangeCrop={onChangeCrop}
              onMoveItem={onMoveItem}
              onRemoveItem={onRemoveItem}
            />
          </View>
        );
      })}
      {footer}
    </Animated.ScrollView>
  );
}

function MagazineCover({ issue, imageUrl }: { issue: MagazineIssue; imageUrl: string | null }) {
  const theme = useShoplyTheme();
  return (
    <View
      accessibilityLabel={`${issue.issueLabel} 표지, ${issue.revision.coverTitle ?? "쇼플리 매거진"}`}
      style={[styles.cover, { backgroundColor: theme.semantic.color.surfaceMuted }]}
    >
      {imageUrl ? (
        <Image
          accessibilityLabel="매거진 표지 사진"
          contentFit="cover"
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          transition={180}
        />
      ) : null}
      <View pointerEvents="none" style={styles.coverMonogram}>
        <ShoplySMonogram size={230} color="rgba(255,255,255,0.28)" />
      </View>
      <View style={[styles.coverTopLine, { borderColor: "rgba(255,255,255,0.72)" }]}>
        <ShoplyText variant="caption" style={styles.coverText}>{issue.issueLabel}</ShoplyText>
        <ShoplyText variant="caption" style={styles.coverText}>SHOPLY / NO. {issue.revision.revisionNumber}</ShoplyText>
      </View>
      <View style={[styles.coverCaptionPanel, { backgroundColor: theme.semantic.color.mediaScrimStrong }]}>
        <ShoplyText style={styles.coverTitle} numberOfLines={2}>
          {issue.revision.coverTitle ?? "THIS WEEK, EDITED"}
        </ShoplyText>
        {issue.revision.coverSubtitle ? (
          <ShoplyText variant="bodyMd" style={styles.coverText} numberOfLines={3}>
            {issue.revision.coverSubtitle}
          </ShoplyText>
        ) : null}
        {(issue.revision.coverLines ?? []).length ? (
          <View style={styles.coverLines}>
            {(issue.revision.coverLines ?? []).slice(0, 3).map((line) => (
              <ShoplyText key={line} variant="caption" style={styles.coverText} numberOfLines={1}>
                — {line}
              </ShoplyText>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function WordmarkBoundary({ index, scrollY }: { index: number; scrollY: SharedValue<number> }) {
  const reduceMotion = useReducedMotion();
  const estimatedCenter = 720 + index * 980;
  const direction = index % 2 === 0 ? 1 : -1;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: reduceMotion
        ? 0
        : interpolate(
            scrollY.value,
            [estimatedCenter - 520, estimatedCenter + 520],
            [-WORDMARK_DISTANCE * direction, WORDMARK_DISTANCE * direction],
            Extrapolation.CLAMP
          )
    }]
  }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.wordmarkRail}>
      <Animated.View style={animatedStyle}>
        <ShoplyWordmark width={260} style={{ opacity: 0.15 }} />
      </Animated.View>
    </View>
  );
}

function MagazineSectionView({
  section,
  layout,
  dealsByItem,
  canEdit,
  onEditBlock,
  onRegenerateBlock,
  regeneratingBlockId,
  onChangeCrop,
  onMoveItem,
  onRemoveItem
}: {
  section: MagazineSection;
  layout: MagazineLayout;
  dealsByItem: Map<string, MagazineDeal>;
  canEdit: boolean;
  onEditBlock?: (block: MagazineEditorialBlock) => void;
  onRegenerateBlock?: (block: MagazineEditorialBlock) => void;
  regeneratingBlockId?: string | null;
  onChangeCrop?: (itemId: string, crop: { x: number; y: number; zoom: number }) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View accessibilityLabel={`${section.title} 섹션`} style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={[styles.issueNumber, { backgroundColor: theme.semantic.color.primary }]}>
          <ShoplyText variant="caption" style={{ color: theme.semantic.color.textInverse }}>
            {String(section.sortOrder + 1).padStart(2, "0")}
          </ShoplyText>
        </View>
        <View style={{ flex: 1 }}>
          {section.kicker ? (
            <ShoplyText variant="caption" color="primary" style={styles.uppercase}>
              {section.kicker}
            </ShoplyText>
          ) : null}
          <ShoplyText style={[styles.sectionTitle, layout === "zine" ? styles.zineTitle : null]}>
            {section.title}
          </ShoplyText>
          {section.intro ? (
            <ShoplyText variant="bodyMd" color="textMuted" style={{ marginTop: 6 }}>
              {section.intro}
            </ShoplyText>
          ) : null}
        </View>
      </View>
      <View style={layout === "edit" ? styles.editGrid : layout === "zine" ? styles.zineGrid : styles.atelierGrid}>
        {section.items.map((item, index) => (
          <MagazineItemCard
            key={item.id}
            item={item}
            index={index}
            layout={layout}
            deal={dealsByItem.get(item.id)}
            canEdit={canEdit}
            onEditBlock={onEditBlock}
            onRegenerateBlock={onRegenerateBlock}
            regeneratingBlockId={regeneratingBlockId}
            onChangeCrop={onChangeCrop}
            onMoveItem={onMoveItem}
            onRemoveItem={onRemoveItem}
            sectionId={section.id}
          />
        ))}
      </View>
    </View>
  );
}

function MagazineItemCard({
  item,
  index,
  layout,
  deal,
  canEdit,
  onEditBlock,
  onRegenerateBlock,
  regeneratingBlockId,
  onChangeCrop,
  onMoveItem,
  onRemoveItem,
  sectionId
}: {
  item: MagazineItem;
  index: number;
  layout: MagazineLayout;
  deal?: MagazineDeal;
  canEdit: boolean;
  onEditBlock?: (block: MagazineEditorialBlock) => void;
  onRegenerateBlock?: (block: MagazineEditorialBlock) => void;
  regeneratingBlockId?: string | null;
  onChangeCrop?: (itemId: string, crop: { x: number; y: number; zoom: number }) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
  sectionId: string;
}) {
  const theme = useShoplyTheme();
  const facts = item.facts;
  const sourceLabel = recommendationSourceLabel(item.recommendationSource);
  const cardStyle = layout === "edit"
    ? styles.editCard
    : layout === "zine"
      ? [styles.zineCard, index % 3 === 1 ? styles.zineCardOffset : null]
      : [styles.atelierCard, index % 3 === 0 ? styles.atelierHeroCard : null];
  const aspectRatio = facts?.mediaWidth && facts.mediaHeight
    ? Math.min(1.35, Math.max(0.68, facts.mediaWidth / facts.mediaHeight))
    : layout === "edit" ? 0.82 : 0.78;
  const disclosure = normalizeDisclosure(facts?.disclosureState);
  const cropX = numericCrop(item.cropPayload, "x", 0.5);
  const cropY = numericCrop(item.cropPayload, "y", 0.5);
  const cropZoom = numericCrop(item.cropPayload, "zoom", 1);

  return (
    <View style={cardStyle}>
      <View style={[styles.photoFrame, { aspectRatio, backgroundColor: theme.semantic.color.surfaceMuted }]}>
        {facts?.mediaUrl ? (
          <Image
            accessibilityLabel={`${facts.brandName ?? "브랜드"} ${facts.productName ?? "아이템"} 사진`}
            contentFit="cover"
            contentPosition={{ left: `${cropX * 100}%`, top: `${cropY * 100}%` }}
            source={{ uri: facts.mediaUrl }}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: cropZoom }] }]}
            transition={180}
          />
        ) : (
          <View style={styles.photoFallback}>
            <ShoplySMonogram size={54} color={theme.semantic.color.primary} />
          </View>
        )}
        {layout === "zine" ? (
          <View style={[styles.zineNumber, { backgroundColor: theme.semantic.color.primary }]}>
            <ShoplyText variant="labelLg" style={{ color: theme.semantic.color.textInverse }}>
              {String(index + 1).padStart(2, "0")}
            </ShoplyText>
          </View>
        ) : null}
      </View>

      <View style={styles.itemMeta}>
        <View style={styles.sourceRow}>
          <View style={[styles.sourcePill, { backgroundColor: theme.semantic.color.primarySoft }]}>
            <ShoplyText variant="caption" color="primary">{sourceLabel}</ShoplyText>
          </View>
          {disclosure !== "none" ? <DisclosureBadge compact state={disclosure} /> : null}
          {facts?.purchaseVerifiedStatus === "verified" ? (
            <View style={[styles.sourcePill, { borderColor: theme.semantic.color.success, borderWidth: 1 }]}>
              <ShoplyText variant="caption" color="success">구매인증</ShoplyText>
            </View>
          ) : null}
        </View>

        {canEdit ? (
          <View style={styles.itemEditActions}>
            <Button
              accessibilityLabel="사진 강조 위치 변경"
              icon={<Scan size={14} color={theme.semantic.color.primary} />}
              label="초점"
              onPress={() => onChangeCrop?.(item.id, {
                x: cropX,
                y: cropY < 0.35 ? 0.5 : cropY < 0.65 ? 0.8 : 0.2,
                zoom: cropZoom
              })}
              size="sm"
              variant="tertiary"
            />
            <Button accessibilityLabel="아이템을 앞으로 이동" icon={<ArrowUp size={14} color={theme.semantic.color.primary} />} onPress={() => onMoveItem?.(sectionId, item.id, -1)} size="icon" variant="tertiary" />
            <Button accessibilityLabel="아이템을 뒤로 이동" icon={<ArrowDown size={14} color={theme.semantic.color.primary} />} onPress={() => onMoveItem?.(sectionId, item.id, 1)} size="icon" variant="tertiary" />
            <Button accessibilityLabel="매거진에서 아이템 제거" icon={<Trash2 size={14} color={theme.semantic.color.danger} />} onPress={() => onRemoveItem?.(item.id)} size="icon" variant="tertiary" />
          </View>
        ) : null}

        <ShoplyText variant="caption" color="textMuted" style={styles.factualCaption}>
          〈{facts?.merchantName ?? "SHOPLY"}, {facts?.brandName ?? "BRAND"} · {facts?.productName ?? "ITEM"}〉
        </ShoplyText>

        {layout === "edit" && facts?.purchasePrice != null ? (
          <View style={styles.priceRow}>
            <ShoplyText variant="titleMd">{formatPrice(facts.purchasePrice, facts.currency)}</ShoplyText>
            {deal ? (
              <View style={[styles.dealBadge, { backgroundColor: theme.semantic.color.dangerFill }]}>
                <ShoplyText variant="labelMd" style={{ color: theme.semantic.color.textInverse }}>
                  {deal.discountPercent}% OFF
                </ShoplyText>
              </View>
            ) : null}
          </View>
        ) : null}

        <EditorialCopy
          block={item.editorialCaption}
          canEdit={canEdit}
          onEdit={onEditBlock}
          onRegenerate={onRegenerateBlock}
          regenerating={regeneratingBlockId === item.editorialCaption?.id}
        />
        {item.body ? (
          <EditorialCopy
            block={item.body}
            body
            canEdit={canEdit}
            onEdit={onEditBlock}
            onRegenerate={onRegenerateBlock}
            regenerating={regeneratingBlockId === item.body.id}
          />
        ) : null}

        {deal ? (
          <View style={[styles.dealPanel, { borderColor: theme.semantic.color.dangerFill }]}>
            <ShoplyText variant="labelMd" color="danger">이번 호 {deal.discountPercent}% 특가</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">에디터 제공 정보 · {formatDate(deal.endsAt)}까지</ShoplyText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${facts?.authorNickname ?? "작성자"} 리뷰 원문 보기`}
          disabled={!item.reviewId}
          onPress={() => item.reviewId && router.push({ pathname: "/review/[reviewId]", params: { reviewId: item.reviewId } })}
          style={styles.photoCredit}
        >
          <ShoplyText variant="caption" color="textMuted">
            PHOTO / @{facts?.authorNickname ?? "shoply_editor"} · 원문 보기
          </ShoplyText>
        </Pressable>
      </View>
    </View>
  );
}

function EditorialCopy({
  block,
  body = false,
  canEdit,
  onEdit,
  onRegenerate,
  regenerating
}: {
  block?: MagazineEditorialBlock | null;
  body?: boolean;
  canEdit: boolean;
  onEdit?: (block: MagazineEditorialBlock) => void;
  onRegenerate?: (block: MagazineEditorialBlock) => void;
  regenerating: boolean;
}) {
  const theme = useShoplyTheme();
  if (!block) return null;
  return (
    <View style={styles.copyBlock}>
      <ShoplyText variant={body ? "bodyMd" : "bodyLg"} style={body ? styles.bodyCopy : styles.captionCopy}>
        {block.text}
      </ShoplyText>
      {canEdit ? (
        <View style={styles.copyActions}>
          <Button
            accessibilityLabel="이 문장 수정"
            icon={<Edit3 size={14} color={theme.semantic.color.primary} />}
            label="수정"
            onPress={() => onEdit?.(block)}
            size="sm"
            variant="tertiary"
          />
          <Button
            accessibilityLabel="이 문장만 AI로 다시 쓰기"
            disabled={regenerating}
            icon={<RefreshCw size={14} color={theme.semantic.color.primary} />}
            label={regenerating ? "작성 중" : "다시 쓰기"}
            onPress={() => onRegenerate?.(block)}
            size="sm"
            variant="tertiary"
          />
        </View>
      ) : null}
    </View>
  );
}

function recommendationSourceLabel(value: string) {
  if (value === "activity") return "내 활동 기반";
  if (value === "taste") return "취향 기반";
  if (value === "popular") return "인기 기반";
  return "에디터 픽";
}

function normalizeDisclosure(value?: string): DisclosureState {
  return ["none", "direct_purchase", "affiliate", "sponsored", "ad", "provided"].includes(value ?? "")
    ? value as DisclosureState
    : "none";
}

function formatPrice(amount: number, currency: string) {
  if (currency === "KRW") return `${Math.round(amount).toLocaleString("ko-KR")}원`;
  return `${currency} ${amount.toLocaleString("ko-KR")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function numericCrop(payload: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = Number(payload?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

const styles = StyleSheet.create({
  atelierCard: { marginBottom: 34, width: "64%" },
  atelierGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  atelierHeroCard: { marginLeft: "12%", width: "88%" },
  bodyCopy: { lineHeight: 23 },
  captionCopy: { fontFamily: "Georgia", lineHeight: 26 },
  copyActions: { flexDirection: "row", gap: 4, marginTop: 4 },
  copyBlock: { gap: 2 },
  cover: { height: 610, justifyContent: "space-between", overflow: "hidden", padding: 20 },
  coverCaptionPanel: { alignSelf: "stretch", gap: 8, marginBottom: 8, padding: 18 },
  coverLines: { gap: 3, marginTop: 6 },
  coverMonogram: { left: -74, position: "absolute", top: 86 },
  coverText: { color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { height: 1, width: 0 }, textShadowRadius: 4 },
  coverTitle: { color: "#FFFFFF", fontFamily: "Georgia", fontSize: 42, fontWeight: "700", letterSpacing: -1.8, lineHeight: 45 },
  coverTopLine: { borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 },
  dealBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 },
  dealPanel: { borderLeftWidth: 3, gap: 2, marginTop: 6, paddingLeft: 10 },
  disclosureRow: { flexDirection: "row", gap: 12, justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  editCard: { marginBottom: 30, width: "48%" },
  editGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  editorLetter: { borderLeftWidth: 2, gap: 12, marginHorizontal: 26, marginVertical: 46, paddingLeft: 20 },
  factualCaption: { fontFamily: "Georgia", marginTop: 2 },
  itemMeta: { gap: 9, paddingTop: 10 },
  issueNumber: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
  itemEditActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 2 },
  photoCredit: { minHeight: 34, justifyContent: "center" },
  photoFallback: { alignItems: "center", flex: 1, justifyContent: "center" },
  photoFrame: { overflow: "hidden", width: "100%" },
  priceRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scrollContent: { paddingBottom: 120 },
  section: { paddingHorizontal: 20, paddingVertical: 18 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: 12, marginBottom: 28 },
  sectionTitle: { fontFamily: "Georgia", fontSize: 32, fontWeight: "700", letterSpacing: -1.2, lineHeight: 38 },
  serifBody: { fontFamily: "Georgia", lineHeight: 28 },
  sourcePill: { alignItems: "center", borderRadius: 999, justifyContent: "center", minHeight: 24, paddingHorizontal: 8 },
  sourceRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  uppercase: { letterSpacing: 1.2 },
  wordmarkRail: { alignItems: "center", height: 78, justifyContent: "center", overflow: "hidden" },
  zineCard: { marginBottom: 28, transform: [{ rotate: "-1deg" }], width: "58%" },
  zineCardOffset: { marginLeft: "38%", transform: [{ rotate: "2deg" }] },
  zineGrid: { paddingHorizontal: 2 },
  zineNumber: { alignItems: "center", bottom: 10, height: 38, justifyContent: "center", position: "absolute", right: -7, transform: [{ rotate: "6deg" }], width: 42 },
  zineTitle: { fontFamily: undefined, fontSize: 38, fontWeight: "900", letterSpacing: -2, lineHeight: 40, textTransform: "uppercase" }
});
