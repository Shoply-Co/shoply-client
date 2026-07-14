import { Image } from "expo-image";
import { Edit3, Plus, RefreshCw } from "lucide-react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";

const SCREEN_WIDTH = Dimensions.get("window").width;
const WORDMARK_DISTANCE = SCREEN_WIDTH * 0.25;

interface MagazineIssueViewerProps {
  issue: MagazineIssue;
  editing?: boolean;
  onEditBlock?: (block: MagazineEditorialBlock) => void;
  onRegenerateBlock?: (block: MagazineEditorialBlock) => void;
  regeneratingBlockId?: string | null;
  onSelectReview?: (itemId: string) => void;
  onOpenReview?: (reviewId: string) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
}

export function MagazineIssueViewer({
  issue,
  editing = false,
  onEditBlock,
  onRegenerateBlock,
  regeneratingBlockId,
  onSelectReview,
  onOpenReview,
  onMoveItem,
  onRemoveItem,
  header,
  footer
}: MagazineIssueViewerProps) {
  const theme = useShoplyTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const coverItem = issue.sections.flatMap((section) => section.items)[0];
  const coverImage = issue.coverImageUrl ?? coverItem?.facts?.mediaUrl ?? null;
  const dealsByItem = useMemo(() => {
    const map = new Map<string, MagazineDeal>();
    for (const deal of issue.deals) if (deal.itemId) map.set(deal.itemId, deal);
    return map;
  }, [issue.deals]);

  return (
    <Animated.ScrollView
      accessibilityLabel={`${issue.issueLabel} 매거진`}
      contentContainerStyle={[
        styles.scrollContent,
        {
          backgroundColor: theme.semantic.color.background,
          paddingBottom: Math.max(insets.bottom + 8, editing ? 12 : 28)
        }
      ]}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={header ? [0] : undefined}
    >
      {header ? (
        <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
          {header}
        </AdaptiveStickyHeader>
      ) : null}
      <MagazineCover issue={issue} imageUrl={coverImage} />
      <View style={styles.disclosureRow}>
        <ShoplyText variant="caption" color="textMuted">
          {issue.issueType === "custom"
            ? "선택한 리뷰의 에디토리얼 문장에만 AI를 활용합니다."
            : issue.revision.aiDisclosure}
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
            <WordmarkBoundary index={index} issueLabel={issue.issueLabel} scrollY={scrollY} />
            <MagazineSectionView
              section={section}
              sectionIndex={index}
              issueLabel={issue.issueLabel}
              layout={layout}
              dealsByItem={dealsByItem}
              canEdit={editing && issue.isOwner && issue.issueType === "custom"}
              onEditBlock={onEditBlock}
              onRegenerateBlock={onRegenerateBlock}
              regeneratingBlockId={regeneratingBlockId}
              onSelectReview={onSelectReview}
              onOpenReview={onOpenReview}
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
  const blankEdition = issue.issueType === "custom" && !imageUrl;
  const coverText = imageUrl ? styles.coverText : { color: theme.semantic.color.text };
  return (
    <View
      accessibilityLabel={`${issue.issueLabel} 표지, ${issue.revision.coverTitle ?? "쇼플리 매거진"}`}
      style={[
        styles.cover,
        blankEdition ? styles.blankEditionCover : null,
        {
          backgroundColor: blankEdition
            ? theme.semantic.color.primarySoft
            : theme.semantic.color.surfaceMuted
        }
      ]}
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
      {blankEdition ? <BlankCoverGrid color={theme.semantic.color.primary} /> : null}
      <View style={[styles.coverMonogram, blankEdition ? styles.blankCoverMonogram : null]}>
        <ShoplySMonogram
          size={blankEdition ? 280 : 230}
          color={blankEdition ? theme.semantic.color.primary : "rgba(255,255,255,0.28)"}
          style={blankEdition ? { opacity: 0.13 } : undefined}
        />
      </View>
      <View
        style={[
          styles.coverTopLine,
          { borderColor: imageUrl ? "rgba(255,255,255,0.72)" : theme.semantic.color.borderStrong }
        ]}
      >
        <ShoplyText variant="caption" style={coverText}>
          {issue.issueLabel}
        </ShoplyText>
        <ShoplyText variant="caption" style={coverText}>
          SHOPLY / NO. {issue.revision.revisionNumber}
        </ShoplyText>
      </View>
      {blankEdition ? (
        <View style={styles.blankCoverAside}>
          <ShoplyText variant="caption" color="primary">
            BUILD YOUR POINT OF VIEW · {issue.baseLayout.toUpperCase()}
          </ShoplyText>
        </View>
      ) : null}
      <View
        style={[
          styles.coverCaptionPanel,
          blankEdition
            ? { borderColor: theme.semantic.color.primary }
            : { backgroundColor: theme.semantic.color.mediaScrimStrong }
        ]}
      >
        <ShoplyText
          style={[styles.coverTitle, blankEdition ? { color: theme.semantic.color.text } : null]}
          numberOfLines={2}
        >
          {issue.revision.coverTitle ?? (blankEdition ? "UNTITLED / EDITION" : "THIS WEEK, EDITED")}
        </ShoplyText>
        <ShoplyText variant="bodyMd" style={coverText} numberOfLines={3}>
          {issue.revision.coverSubtitle ??
            (blankEdition ? "빈 지면을 누르고, 당신의 리뷰로 한 장씩 완성하세요." : null)}
        </ShoplyText>
        {(issue.revision.coverLines ?? []).length ? (
          <View style={styles.coverLines}>
            {(issue.revision.coverLines ?? []).slice(0, 3).map((line) => (
              <ShoplyText key={line} variant="caption" style={coverText} numberOfLines={1}>
                — {line}
              </ShoplyText>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BlankCoverGrid({ color }: { color: string }) {
  return (
    <View style={styles.blankCoverGrid}>
      {[0, 1, 2, 3, 4, 5].map((column) => (
        <View key={column} style={[styles.blankCoverGridLine, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

function WordmarkBoundary({
  index,
  issueLabel,
  scrollY
}: {
  index: number;
  issueLabel: string;
  scrollY: SharedValue<number>;
}) {
  const theme = useShoplyTheme();
  const reduceMotion = useReducedMotion();
  const estimatedCenter = 720 + index * 980;
  const direction = index % 2 === 0 ? 1 : -1;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduceMotion
          ? 0
          : interpolate(
              scrollY.value,
              [estimatedCenter - 520, estimatedCenter + 520],
              [-WORDMARK_DISTANCE * direction, WORDMARK_DISTANCE * direction],
              Extrapolation.CLAMP
            )
      }
    ]
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.wordmarkRail,
        {
          backgroundColor: theme.semantic.color.primarySoft,
          borderColor: theme.semantic.color.primary
        }
      ]}
    >
      <Animated.View style={[styles.wordmarkTrack, animatedStyle]}>
        <ShoplyText style={[styles.wordmarkIndex, { color: theme.semantic.color.primary }]}>
          {String(index + 1).padStart(2, "0")}
        </ShoplyText>
        <ShoplyWordmark width={228} style={{ opacity: 0.26 }} />
        <ShoplyText
          variant="caption"
          style={[styles.wordmarkCopy, { color: theme.semantic.color.primary }]}
          numberOfLines={1}
        >
          쇼핑을 쇼핑답게 · {issueLabel} · THE SHOPLY EDIT
        </ShoplyText>
        <ShoplyWordmark width={150} style={{ opacity: 0.13 }} />
      </Animated.View>
    </View>
  );
}

function MagazineSectionView({
  section,
  sectionIndex,
  issueLabel,
  layout,
  dealsByItem,
  canEdit,
  onEditBlock,
  onRegenerateBlock,
  regeneratingBlockId,
  onSelectReview,
  onOpenReview,
  onMoveItem,
  onRemoveItem
}: {
  section: MagazineSection;
  sectionIndex: number;
  issueLabel: string;
  layout: MagazineLayout;
  dealsByItem: Map<string, MagazineDeal>;
  canEdit: boolean;
  onEditBlock?: (block: MagazineEditorialBlock) => void;
  onRegenerateBlock?: (block: MagazineEditorialBlock) => void;
  regeneratingBlockId?: string | null;
  onSelectReview?: (itemId: string) => void;
  onOpenReview?: (reviewId: string) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View accessibilityLabel={`${section.title} 섹션`} style={styles.section}>
      {!canEdit ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.sectionRunningType}
        >
          <ShoplyText
            variant="caption"
            style={[styles.sectionRunningTypeText, { color: theme.semantic.color.primary }]}
          >
            SHOPLY EDITORIAL · SECTION {String(sectionIndex + 1).padStart(2, "0")}
          </ShoplyText>
        </View>
      ) : null}
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
          <View style={styles.sectionTitleRule}>
            <View
              style={[
                styles.sectionTitleRuleLine,
                { backgroundColor: theme.semantic.color.primary }
              ]}
            />
            <ShoplyText variant="caption" color="primary" style={styles.uppercase}>
              THE SHOPLY EDIT / {layout.toUpperCase()}
            </ShoplyText>
          </View>
          {section.intro ? (
            <ShoplyText variant="bodyMd" color="textMuted" style={styles.sectionIntro}>
              {section.intro}
            </ShoplyText>
          ) : null}
        </View>
      </View>
      <View
        style={
          layout === "edit"
            ? styles.editGrid
            : layout === "zine"
              ? styles.zineGrid
              : styles.atelierGrid
        }
      >
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
            onSelectReview={onSelectReview}
            onOpenReview={onOpenReview}
            onMoveItem={onMoveItem}
            onRemoveItem={onRemoveItem}
            sectionId={section.id}
          />
        ))}
      </View>
      {!canEdit ? (
        <View style={[styles.sectionFolio, { borderColor: theme.semantic.color.borderStrong }]}>
          <ShoplyText variant="caption" color="textMuted" style={styles.uppercase}>
            SHOPLY · {issueLabel}
          </ShoplyText>
          <ShoplyText style={[styles.sectionFolioNumber, { color: theme.semantic.color.primary }]}>
            {String(sectionIndex + 1).padStart(2, "0")}
          </ShoplyText>
        </View>
      ) : null}
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
  onSelectReview,
  onOpenReview,
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
  onSelectReview?: (itemId: string) => void;
  onOpenReview?: (reviewId: string) => void;
  onMoveItem?: (sectionId: string, itemId: string, direction: -1 | 1) => void;
  onRemoveItem?: (itemId: string) => void;
  sectionId: string;
}) {
  const theme = useShoplyTheme();
  const facts = item.facts;
  const sourceLabel = recommendationSourceLabel(item.recommendationSource);
  const placement = editorialPlacement(layout, index);
  const sideBySide = placement === "side";
  const cardStyle = [
    styles.itemCard,
    layout === "edit" ? styles.editCard : layout === "zine" ? styles.zineCard : styles.atelierCard,
    placement === "lead" ? styles.leadCard : null,
    placement === "compact" ? styles.compactCard : null,
    placement === "offset" ? styles.offsetCard : null,
    sideBySide ? styles.sideCard : null,
    layout === "zine" && index % 2 === 1 ? styles.zineCardTiltRight : null
  ];
  const photoFrameStyle = [
    styles.photoFrame,
    placement === "lead"
      ? styles.leadPhoto
      : placement === "compact"
        ? styles.compactPhoto
        : placement === "offset"
          ? styles.offsetPhoto
          : styles.sidePhoto
  ];
  const disclosure = normalizeDisclosure(facts?.disclosureState);
  const cropX = numericCrop(item.cropPayload, "x", 0.5);
  const cropY = numericCrop(item.cropPayload, "y", 0.5);
  const cropZoom = Math.min(2.5, Math.max(1, numericCrop(item.cropPayload, "zoom", 1)));

  if (!facts) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`빈 에디션 슬롯 ${index + 1}, 내 리뷰 선택`}
        disabled={!canEdit || !onSelectReview}
        onPress={() => onSelectReview?.(item.id)}
        style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.78 : 1 }]}
      >
        <View
          style={[
            photoFrameStyle,
            styles.blankPhoto,
            {
              backgroundColor: theme.semantic.color.primarySoft,
              borderColor: theme.semantic.color.primary
            }
          ]}
        >
          <View style={styles.blankSlotHeader}>
            <ShoplyText variant="caption" color="primary">
              GRID SLOT
            </ShoplyText>
            <ShoplyText style={[styles.blankSlotNumber, { color: theme.semantic.color.primary }]}>
              {String(index + 1).padStart(2, "0")}
            </ShoplyText>
          </View>
          <View style={[styles.blankPlus, { backgroundColor: theme.semantic.color.primary }]}>
            <Plus size={22} color={theme.semantic.color.textInverse} />
          </View>
          <ShoplyText variant="labelLg" color="primary">
            내 리뷰 놓기
          </ShoplyText>
        </View>
        <View
          style={[
            styles.itemMeta,
            sideBySide ? styles.sideMeta : null,
            placement === "lead" ? styles.leadMeta : null
          ]}
        >
          <View
            style={[styles.blankTextRule, { backgroundColor: theme.semantic.color.borderStrong }]}
          />
          <ShoplyText variant="caption" color="primary">
            PHOTO + EDITORIAL COPY
          </ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted">
            리뷰를 선택하면 사진과 에디토리얼 문장이 이 칸에 함께 배치됩니다.
          </ShoplyText>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={cardStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${facts?.productName ?? "잡지 속"} 리뷰 상세 보기`}
        accessibilityState={{ disabled: canEdit || !item.reviewId || !onOpenReview }}
        disabled={canEdit || !item.reviewId || !onOpenReview}
        onPress={() => item.reviewId && onOpenReview?.(item.reviewId)}
        style={[
          photoFrameStyle,
          {
            backgroundColor: theme.semantic.color.surfaceMuted
          }
        ]}
      >
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
      </Pressable>

      <View
        style={[
          styles.itemMeta,
          sideBySide ? styles.sideMeta : null,
          placement === "lead" ? styles.leadMeta : null
        ]}
      >
        <View style={styles.sourceRow}>
          <View style={[styles.sourcePill, { backgroundColor: theme.semantic.color.primarySoft }]}>
            <ShoplyText variant="caption" color="primary">
              {sourceLabel}
            </ShoplyText>
          </View>
          {disclosure !== "none" ? <DisclosureBadge compact state={disclosure} /> : null}
          {facts?.purchaseVerifiedStatus === "verified" ? (
            <View
              style={[
                styles.sourcePill,
                { borderColor: theme.semantic.color.success, borderWidth: 1 }
              ]}
            >
              <ShoplyText variant="caption" color="success">
                구매인증
              </ShoplyText>
            </View>
          ) : null}
        </View>

        {canEdit ? (
          <View style={styles.itemEditActions}>
            <Button
              accessibilityLabel="이 슬롯의 리뷰 변경"
              icon={<RefreshCw size={14} color={theme.semantic.color.primary} />}
              label="리뷰 변경"
              onPress={() => onSelectReview?.(item.id)}
              size="sm"
              variant="tertiary"
            />
            {onMoveItem ? (
              <Button
                accessibilityLabel="아이템을 앞으로 이동"
                label="앞으로"
                onPress={() => onMoveItem(sectionId, item.id, -1)}
                size="sm"
                variant="tertiary"
              />
            ) : null}
            {onMoveItem ? (
              <Button
                accessibilityLabel="아이템을 뒤로 이동"
                label="뒤로"
                onPress={() => onMoveItem(sectionId, item.id, 1)}
                size="sm"
                variant="tertiary"
              />
            ) : null}
            {onRemoveItem ? (
              <Button
                accessibilityLabel="매거진에서 아이템 제거"
                label="제거"
                onPress={() => onRemoveItem(item.id)}
                size="sm"
                variant="tertiary"
              />
            ) : null}
          </View>
        ) : null}

        <ShoplyText variant="caption" color="textMuted" style={styles.factualCaption}>
          〈{facts?.merchantName ?? "SHOPLY"}, {facts?.brandName ?? "BRAND"} ·{" "}
          {facts?.productName ?? "ITEM"}〉
        </ShoplyText>

        {layout === "edit" && facts?.purchasePrice != null ? (
          <View style={styles.priceRow}>
            <ShoplyText variant="titleMd">
              {formatPrice(facts.purchasePrice, facts.currency)}
            </ShoplyText>
            {deal ? (
              <View
                style={[styles.dealBadge, { backgroundColor: theme.semantic.color.dangerFill }]}
              >
                <ShoplyText variant="labelMd" style={{ color: theme.semantic.color.textInverse }}>
                  {deal.discountPercent}% OFF
                </ShoplyText>
              </View>
            ) : null}
          </View>
        ) : null}

        <EditorialCopy
          block={item.editorialCaption}
          emphasis={placement === "lead" ? "lead" : placement === "compact" ? "compact" : "default"}
          canEdit={canEdit}
          onEdit={onEditBlock}
          onRegenerate={onRegenerateBlock}
          regenerating={regeneratingBlockId === item.editorialCaption?.id}
        />
        {item.body ? (
          <EditorialCopy
            block={item.body}
            body
            emphasis={placement === "compact" ? "compact" : "default"}
            canEdit={canEdit}
            onEdit={onEditBlock}
            onRegenerate={onRegenerateBlock}
            regenerating={regeneratingBlockId === item.body.id}
          />
        ) : null}

        {deal ? (
          <View style={[styles.dealPanel, { borderColor: theme.semantic.color.dangerFill }]}>
            <ShoplyText variant="labelMd" color="danger">
              이번 호 {deal.discountPercent}% 특가
            </ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              에디터 제공 정보 · {formatDate(deal.endsAt)}까지
            </ShoplyText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${facts?.authorNickname ?? "작성자"} 리뷰 원문 보기`}
          disabled={!item.reviewId || !onOpenReview}
          onPress={() => item.reviewId && onOpenReview?.(item.reviewId)}
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
  emphasis = "default",
  canEdit,
  onEdit,
  onRegenerate,
  regenerating
}: {
  block?: MagazineEditorialBlock | null;
  body?: boolean;
  emphasis?: "default" | "lead" | "compact";
  canEdit: boolean;
  onEdit?: (block: MagazineEditorialBlock) => void;
  onRegenerate?: (block: MagazineEditorialBlock) => void;
  regenerating: boolean;
}) {
  const theme = useShoplyTheme();
  if (!block) return null;
  return (
    <View style={styles.copyBlock}>
      <ShoplyText
        variant={body || emphasis === "compact" ? "bodyMd" : "bodyLg"}
        style={[
          body ? styles.bodyCopy : styles.captionCopy,
          !body && emphasis === "lead" ? styles.leadCaptionCopy : null,
          emphasis === "compact" ? styles.compactCopy : null
        ]}
      >
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

function editorialPlacement(layout: MagazineLayout, index: number) {
  if (layout === "edit") {
    if (index % 5 === 0) return "side" as const;
    return "compact" as const;
  }
  if (layout === "zine") {
    if (index % 4 === 0) return "lead" as const;
    if (index % 4 === 1) return "compact" as const;
    if (index % 4 === 2) return "offset" as const;
    return "side" as const;
  }
  if (index % 5 === 0) return "lead" as const;
  if (index % 5 === 1 || index % 5 === 2) return "compact" as const;
  if (index % 5 === 3) return "side" as const;
  return "offset" as const;
}

function recommendationSourceLabel(value: string) {
  if (value === "activity") return "내 활동 기반";
  if (value === "taste") return "취향 기반";
  if (value === "popular") return "인기 기반";
  return "에디터 픽";
}

function normalizeDisclosure(value?: string): DisclosureState {
  return ["none", "direct_purchase", "affiliate", "sponsored", "ad", "provided"].includes(
    value ?? ""
  )
    ? (value as DisclosureState)
    : "none";
}

function formatPrice(amount: number, currency: string) {
  if (currency === "KRW") return `${Math.round(amount).toLocaleString("ko-KR")}원`;
  return `${currency} ${amount.toLocaleString("ko-KR")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(
    new Date(value)
  );
}

function numericCrop(payload: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = Number(payload?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

const styles = StyleSheet.create({
  atelierCard: { width: "62%" },
  atelierGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  blankCoverAside: {
    left: -56,
    pointerEvents: "none",
    position: "absolute",
    top: 270,
    transform: [{ rotate: "-90deg" }],
    width: 250
  },
  blankCoverGrid: {
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 20,
    opacity: 0.09,
    pointerEvents: "none",
    position: "absolute",
    right: 20,
    top: 0
  },
  blankCoverGridLine: { height: "100%", width: StyleSheet.hairlineWidth },
  blankCoverMonogram: { left: -92, top: 96 },
  blankEditionCover: { height: 540 },
  blankPhoto: {
    alignItems: "center",
    borderStyle: "dashed",
    borderWidth: 1.2,
    gap: 7,
    justifyContent: "center",
    minHeight: 168
  },
  blankPlus: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  blankSlotHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 10,
    position: "absolute",
    right: 10,
    top: 8
  },
  blankSlotNumber: { fontFamily: "Georgia", fontSize: 22, fontWeight: "700", lineHeight: 24 },
  blankTextRule: { height: StyleSheet.hairlineWidth, width: "100%" },
  bodyCopy: { lineHeight: 23 },
  captionCopy: { fontFamily: "Georgia", lineHeight: 26 },
  compactCard: { width: "47%" },
  compactPhoto: { aspectRatio: 0.76, minHeight: 200 },
  compactCopy: { fontSize: 14, lineHeight: 20 },
  copyActions: { flexDirection: "row", gap: 4, marginTop: 4 },
  copyBlock: { gap: 2 },
  cover: { height: 610, justifyContent: "space-between", overflow: "hidden", padding: 20 },
  coverCaptionPanel: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    gap: 8,
    marginBottom: 8,
    padding: 18
  },
  coverLines: { gap: 3, marginTop: 6 },
  coverMonogram: { left: -74, pointerEvents: "none", position: "absolute", top: 86 },
  coverText: {
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 4
  },
  coverTitle: {
    color: "#FFFFFF",
    fontFamily: "Georgia",
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -1.8,
    lineHeight: 45
  },
  coverTopLine: {
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10
  },
  dealBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 },
  dealPanel: { borderLeftWidth: 3, gap: 2, marginTop: 6, paddingLeft: 10 },
  disclosureRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  editCard: { width: "48%" },
  editGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  editorLetter: {
    borderLeftWidth: 2,
    gap: 12,
    marginHorizontal: 26,
    marginVertical: 46,
    paddingLeft: 20
  },
  factualCaption: { fontFamily: "Georgia", marginTop: 2 },
  itemCard: { marginBottom: 38 },
  itemMeta: { gap: 9, paddingTop: 10 },
  issueNumber: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
  itemEditActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 2 },
  leadCaptionCopy: { fontSize: 23, letterSpacing: -0.5, lineHeight: 30 },
  leadCard: { width: "100%" },
  leadPhoto: { aspectRatio: 0.9, minHeight: 360 },
  leadMeta: { alignSelf: "flex-end", width: "84%" },
  offsetCard: { marginLeft: "34%", width: "66%" },
  offsetPhoto: { aspectRatio: 0.88, minHeight: 250 },
  photoCredit: { minHeight: 34, justifyContent: "center" },
  photoFallback: { alignItems: "center", flex: 1, justifyContent: "center" },
  photoFrame: { alignSelf: "stretch", flexShrink: 0, overflow: "hidden", width: "100%" },
  priceRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scrollContent: {},
  stickyHeader: {
    paddingVertical: 2
  },
  section: { overflow: "hidden", paddingHorizontal: 20, paddingVertical: 18, position: "relative" },
  sectionFolio: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12
  },
  sectionFolioNumber: { fontFamily: "Georgia", fontSize: 24, fontWeight: "700", lineHeight: 28 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: 12, marginBottom: 34 },
  sectionIntro: { alignSelf: "flex-end", lineHeight: 22, marginTop: 10, width: "82%" },
  sectionRunningType: {
    pointerEvents: "none",
    position: "absolute",
    right: -92,
    top: 300,
    transform: [{ rotate: "90deg" }],
    width: 220,
    zIndex: 2
  },
  sectionRunningTypeText: { letterSpacing: 1.6, opacity: 0.46 },
  sectionTitle: {
    fontFamily: "Georgia",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 38
  },
  sectionTitleRule: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  sectionTitleRuleLine: { height: 2, width: 28 },
  serifBody: { fontFamily: "Georgia", lineHeight: 28 },
  sideCard: { alignItems: "flex-start", flexDirection: "row", gap: 14, width: "100%" },
  sideMeta: { flex: 1, paddingTop: 0 },
  sidePhoto: { aspectRatio: 0.76, minHeight: 236, width: "52%" },
  sourcePill: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 24,
    paddingHorizontal: 8
  },
  sourceRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  uppercase: { letterSpacing: 1.2 },
  wordmarkRail: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 92,
    justifyContent: "center",
    overflow: "hidden",
    pointerEvents: "none"
  },
  wordmarkCopy: { letterSpacing: 1.5, minWidth: 272, textTransform: "uppercase" },
  wordmarkIndex: { fontFamily: "Georgia", fontSize: 38, fontWeight: "700", lineHeight: 42 },
  wordmarkTrack: {
    alignItems: "center",
    flexDirection: "row",
    gap: 22,
    justifyContent: "center",
    width: SCREEN_WIDTH + 420
  },
  zineCard: { transform: [{ rotate: "-1deg" }], width: "70%" },
  zineCardTiltRight: { transform: [{ rotate: "1.6deg" }] },
  zineGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 2 },
  zineNumber: {
    alignItems: "center",
    bottom: 10,
    height: 38,
    justifyContent: "center",
    position: "absolute",
    right: -7,
    transform: [{ rotate: "6deg" }],
    width: 42
  },
  zineTitle: {
    fontFamily: undefined,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 40,
    textTransform: "uppercase"
  }
});
