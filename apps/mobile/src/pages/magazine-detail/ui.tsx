import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { ArrowLeft, BookmarkPlus, Check, Edit3, Send, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  KeyboardAwareBottomSheet,
  ShoplyText,
  useShoplyTheme
} from "@shoply/design-system";
import {
  useMagazineIssue,
  useCustomMagazineSources,
  isMagazineGeneratingStatus,
  type MagazineEditorialBlock,
  type MagazineIssue,
  type MagazineLayout
} from "@/entities/magazine";
import {
  useDeleteMagazine,
  useFillMagazineSlot,
  usePublishMagazine,
  useRegenerateMagazineBlock,
  useUpdateMagazine,
  useUpdateMagazineBlock
} from "@/features/magazine-edit";
import { useMagazineSubscription } from "@/features/magazine-subscribe";
import { userFacingErrorMessage } from "@/shared/api/errors";
import type { UpdateMagazineRequest } from "@/shared/api/generated/shoply";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { ShoplySMonogram, ShoplyWordmark } from "@/shared/ui/brand";
import { MagazineIssueViewer } from "@/widgets/magazine-issue-viewer";

const MAGAZINE_EDITORIAL_TEXT_LIMITS = {
  atelier: { caption: 44, body: 72, editorLetter: 180 },
  zine: { caption: 28, body: 44, editorLetter: 120 },
  edit: { caption: 32, body: 56, editorLetter: 150 }
} as const satisfies Record<
  MagazineLayout,
  {
    caption: number;
    body: number;
    editorLetter: number;
  }
>;

const MIN_LAYOUT_TRANSITION_MS = 900;

function editorialBlockLimit(issue: MagazineIssue, block: MagazineEditorialBlock | null) {
  const sectionLayout = block
    ? issue.sections.find((section) =>
        section.items.some(
          (item) => item.editorialCaption?.id === block.id || item.body?.id === block.id
        )
      )?.layoutOverride
    : null;
  const limits = MAGAZINE_EDITORIAL_TEXT_LIMITS[sectionLayout ?? issue.baseLayout];
  return block?.blockType === "caption" ? limits.caption : limits.body;
}

export function MagazineDetailPage() {
  const { issueId } = useLocalSearchParams<{ issueId?: string }>();
  const theme = useShoplyTheme();
  const query = useMagazineIssue(issueId);
  const subscription = useMagazineSubscription();
  const deleteMagazine = useDeleteMagazine();

  if (query.isPending) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ActivityIndicator color={theme.semantic.color.primary} />
        <ShoplyText color="textMuted">잡지의 페이지를 펼치고 있어요.</ShoplyText>
      </SafeAreaView>
    );
  }

  if (!query.data || query.isError) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ShoplyText variant="titleMd">잡지를 열지 못했어요</ShoplyText>
        <ShoplyText color="textMuted" align="center">
          {userFacingErrorMessage(query.error, "비공개이거나 삭제된 잡지일 수 있어요.")}
        </ShoplyText>
        <Button label="돌아가기" onPress={() => goBackOrReplace("/(tabs)/shoply")} />
      </SafeAreaView>
    );
  }

  const issue = query.data;
  if (isMagazineGeneratingStatus(issue.status)) {
    return <MagazineGenerationState issue={issue} />;
  }
  if (issue.status === "failed") {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ShoplyText variant="titleMd">매거진을 만들지 못했어요</ShoplyText>
        <ShoplyText color="textMuted" align="center">
          다음 앱 방문 때 다시 생성을 시도합니다. 잠시 후 앱을 다시 열어주세요.
        </ShoplyText>
        <Button label="잡지 목록으로" onPress={() => goBackOrReplace("/(tabs)/shoply")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <MagazineIssueViewer
        issue={issue}
        onOpenReview={(reviewId) =>
          router.push({
            pathname: "/magazine/[issueId]/review/[reviewId]" as never,
            params: { issueId: issue.id, reviewId }
          })
        }
        header={
          <MagazineHeader
            issue={issue}
            subscribing={subscription.isPending}
            deleting={deleteMagazine.isPending}
            onEdit={
              issue.isOwner && issue.issueType === "custom"
                ? () =>
                    router.push({
                      pathname: "/magazine/[issueId]/edit",
                      params: { issueId: issue.id }
                    })
                : undefined
            }
            onSubscribe={() =>
              subscription.mutate({
                seriesId: issue.owner.userId,
                subscribed: issue.isSubscribed
              })
            }
            onDelete={
              issue.isOwner && issue.issueType === "custom"
                ? () => {
                    Alert.alert(
                      "이 에디션을 삭제할까요?",
                      "삭제한 에디션은 다시 복구할 수 없어요.",
                      [
                        { text: "취소", style: "cancel" },
                        {
                          text: "삭제",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await deleteMagazine.mutateAsync(issue.id);
                              goBackOrReplace("/(tabs)/shoply");
                            } catch (error) {
                              Alert.alert(
                                "에디션을 삭제하지 못했어요",
                                userFacingErrorMessage(error, "잠시 후 다시 시도해주세요.")
                              );
                            }
                          }
                        }
                      ]
                    );
                  }
                : undefined
            }
          />
        }
      />
    </SafeAreaView>
  );
}

export function MagazineEditPage() {
  const { issueId } = useLocalSearchParams<{ issueId?: string }>();
  const theme = useShoplyTheme();
  const query = useMagazineIssue(issueId);
  const updateMagazine = useUpdateMagazine();
  const updateBlock = useUpdateMagazineBlock();
  const regenerateBlock = useRegenerateMagazineBlock();
  const fillSlot = useFillMagazineSlot();
  const publish = usePublishMagazine();
  const [editingBlock, setEditingBlock] = useState<MagazineEditorialBlock | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceSlotId, setSourceSlotId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [layoutTransitioning, setLayoutTransitioning] = useState(false);
  const sourceQuery = useCustomMagazineSources(sourcesOpen);

  useEffect(() => {
    if (!editingBlock) return;
    setDraftText(editingBlock.text);
  }, [editingBlock]);

  if (query.isPending) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ActivityIndicator color={theme.semantic.color.primary} />
        <ShoplyText color="textMuted">잡지의 페이지를 펼치고 있어요.</ShoplyText>
      </SafeAreaView>
    );
  }

  if (!query.data || query.isError) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ShoplyText variant="titleMd">잡지를 열지 못했어요</ShoplyText>
        <ShoplyText color="textMuted" align="center">
          {userFacingErrorMessage(query.error, "비공개이거나 삭제된 잡지일 수 있어요.")}
        </ShoplyText>
        <Button label="돌아가기" onPress={() => goBackOrReplace("/(tabs)/shoply")} />
      </SafeAreaView>
    );
  }

  const issue = query.data;
  if (!issue.isOwner || issue.issueType !== "custom") {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ShoplyText variant="titleMd">편집할 수 없는 잡지예요</ShoplyText>
        <ShoplyText color="textMuted" align="center">
          에디션은 소유자만 별도 편집실에서 수정할 수 있어요.
        </ShoplyText>
        <Button
          label="잡지로 돌아가기"
          onPress={() =>
            goBackOrReplace({
              pathname: "/magazine/[issueId]",
              params: { issueId: issue.id }
            })
          }
        />
      </SafeAreaView>
    );
  }
  if (isMagazineGeneratingStatus(issue.status)) {
    return <MagazineGenerationState issue={issue} />;
  }
  if (issue.status === "failed") {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: theme.semantic.color.background }]}>
        <ShoplyText variant="titleMd">매거진을 만들지 못했어요</ShoplyText>
        <ShoplyText color="textMuted" align="center">
          다음 앱 방문 때 다시 생성을 시도합니다. 잠시 후 앱을 다시 열어주세요.
        </ShoplyText>
        <Button label="잡지 목록으로" onPress={() => goBackOrReplace("/(tabs)/shoply")} />
      </SafeAreaView>
    );
  }
  const sourceSlotNumber =
    issue.sections
      .flatMap((section) => section.items)
      .findIndex((item) => item.id === sourceSlotId) + 1;
  const editingBlockMaxLength = editorialBlockLimit(issue, editingBlock);
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <MagazineIssueViewer
        issue={issue}
        editing
        regeneratingBlockId={regenerateBlock.variables?.blockId ?? null}
        onEditBlock={setEditingBlock}
        onRegenerateBlock={(block) =>
          regenerateBlock.mutate({ issueId: issue.id, blockId: block.id })
        }
        onSelectReview={(itemId) => {
          setSourceSlotId(itemId);
          setSourcesOpen(true);
        }}
        header={<EditionStudioHeader issue={issue} />}
        footer={
          <MagazineEditorPanel
            issue={issue}
            busy={updateMagazine.isPending || publish.isPending || layoutTransitioning}
            onUpdate={async (patch) => {
              const changesLayout = typeof patch.baseLayout === "string";
              if (changesLayout) setLayoutTransitioning(true);
              try {
                await Promise.all([
                  updateMagazine.mutateAsync({ issueId: issue.id, patch }),
                  changesLayout
                    ? new Promise<void>((resolve) => setTimeout(resolve, MIN_LAYOUT_TRANSITION_MS))
                    : Promise.resolve()
                ]);
              } catch (error) {
                Alert.alert(
                  "잡지를 수정하지 못했어요",
                  userFacingErrorMessage(error, "잠시 후 다시 시도해주세요.")
                );
              } finally {
                if (changesLayout) setLayoutTransitioning(false);
              }
            }}
            onPublish={() => {
              Alert.alert(
                "이 잡지를 발행할까요?",
                "발행하면 다른 사용자가 보고 구독할 수 있어요.",
                [
                  { text: "취소", style: "cancel" },
                  { text: "발행", onPress: () => publish.mutate(issue.id) }
                ]
              );
            }}
          />
        }
      />

      {layoutTransitioning ? (
        <View
          accessibilityLabel="잡지 레이아웃 적용 중"
          accessibilityLiveRegion="polite"
          style={[
            styles.layoutLoadingOverlay,
            { backgroundColor: theme.semantic.color.background }
          ]}
        >
          <ActivityIndicator color={theme.semantic.color.primary} size="large" />
          <ShoplyText variant="labelLg">레이아웃을 정리하고 있어요.</ShoplyText>
        </View>
      ) : null}

      <KeyboardAwareBottomSheet
        visible={Boolean(editingBlock)}
        onClose={() => setEditingBlock(null)}
        accessibilityLabel="문장 편집 닫기"
        contentStyle={[styles.sheet, { backgroundColor: theme.semantic.color.surface }]}
      >
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleMd">잡지 문장 편집</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              사실 정보는 고정되고 에디토리얼 문장만 바뀝니다.
            </ShoplyText>
          </View>
          <Button
            size="icon"
            variant="tertiary"
            accessibilityLabel="문장 편집 닫기"
            icon={<X size={18} color={theme.semantic.color.text} />}
            onPress={() => setEditingBlock(null)}
          />
        </View>
        <TextInput
          accessibilityLabel="에디토리얼 문장"
          multiline
          maxLength={editingBlockMaxLength}
          onChangeText={setDraftText}
          placeholder="잡지 문장을 입력하세요"
          placeholderTextColor={theme.semantic.color.textMuted}
          style={[
            styles.textArea,
            { borderColor: theme.semantic.color.border, color: theme.semantic.color.text }
          ]}
          value={draftText}
        />
        <View style={styles.sheetFooter}>
          <ShoplyText
            variant="caption"
            color={draftText.length > editingBlockMaxLength ? "danger" : "textMuted"}
          >
            지면 권장 길이 {draftText.length}/{editingBlockMaxLength}
          </ShoplyText>
          <Button
            disabled={
              !editingBlock ||
              !draftText.trim() ||
              draftText.length > editingBlockMaxLength ||
              updateBlock.isPending
            }
            label={updateBlock.isPending ? "저장 중" : "문장 저장"}
            onPress={async () => {
              if (!editingBlock) return;
              await updateBlock.mutateAsync({
                issueId: issue.id,
                blockId: editingBlock.id,
                text: draftText.trim()
              });
              setEditingBlock(null);
            }}
          />
        </View>
      </KeyboardAwareBottomSheet>

      <KeyboardAwareBottomSheet
        visible={sourcesOpen}
        onClose={() => {
          setSourcesOpen(false);
          setSourceSlotId(null);
        }}
        accessibilityLabel="콘텐츠 선택 닫기"
        contentStyle={[styles.sourceSheet, { backgroundColor: theme.semantic.color.surface }]}
      >
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
              PLACE A STORY / SLOT {String(Math.max(1, sourceSlotNumber)).padStart(2, "0")}
            </ShoplyText>
            <ShoplyText style={styles.sourceSheetTitle}>어떤 장면을 놓을까요?</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              선택한 리뷰의 사진과 새 에디토리얼 문장이 한 세트로 배치됩니다.
            </ShoplyText>
          </View>
          <Button
            size="icon"
            variant="tertiary"
            accessibilityLabel="콘텐츠 선택 닫기"
            icon={<X size={18} color={theme.semantic.color.text} />}
            onPress={() => {
              setSourcesOpen(false);
              setSourceSlotId(null);
            }}
          />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sourceList}
          keyboardShouldPersistTaps="handled"
        >
          {(sourceQuery.data ?? [])
            .filter(
              (source) =>
                !issue.sections.some((section) =>
                  section.items.some(
                    (item) => item.reviewId === source.reviewId && item.id !== sourceSlotId
                  )
                )
            )
            .map((source) => (
              <View
                key={source.reviewId}
                style={[styles.sourceCard, { borderColor: theme.semantic.color.border }]}
              >
                <View
                  style={[
                    styles.sourceThumb,
                    { backgroundColor: theme.semantic.color.surfaceMuted }
                  ]}
                >
                  {source.mediaUrl ? (
                    <Image
                      accessibilityLabel="추가할 리뷰 사진"
                      contentFit="cover"
                      source={{ uri: source.mediaUrl }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.sourceSelectMark,
                      { backgroundColor: theme.semantic.color.primary }
                    ]}
                  >
                    <ShoplyText
                      variant="caption"
                      style={{ color: theme.semantic.color.textInverse }}
                    >
                      SELECT
                    </ShoplyText>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <ShoplyText variant="labelLg" numberOfLines={2}>
                    {source.productName ?? source.title ?? "리뷰 아이템"}
                  </ShoplyText>
                  <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
                    {source.brandName ?? "브랜드 미지정"} · @{source.authorNickname}
                  </ShoplyText>
                </View>
                <Button
                  accessibilityLabel={`${source.productName ?? source.title ?? "리뷰"}를 선택한 슬롯에 배치`}
                  disabled={!sourceSlotId || fillSlot.isPending}
                  label={
                    fillSlot.isPending && fillSlot.variables?.reviewId === source.reviewId
                      ? "문장 작성 중"
                      : "선택"
                  }
                  size="sm"
                  onPress={async () => {
                    if (!sourceSlotId) return;
                    try {
                      await fillSlot.mutateAsync({
                        issueId: issue.id,
                        slotId: sourceSlotId,
                        reviewId: source.reviewId
                      });
                      setSourcesOpen(false);
                      setSourceSlotId(null);
                    } catch (error) {
                      Alert.alert(
                        "리뷰를 배치하지 못했어요",
                        userFacingErrorMessage(error, "잠시 후 다시 시도해주세요.")
                      );
                    }
                  }}
                />
              </View>
            ))}
          {sourceQuery.isPending ? (
            <ActivityIndicator color={theme.semantic.color.primary} />
          ) : null}
          {!sourceQuery.isPending && !(sourceQuery.data ?? []).length ? (
            <ShoplyText color="textMuted" align="center">
              추가할 수 있는 리뷰가 아직 없어요.
            </ShoplyText>
          ) : null}
        </ScrollView>
      </KeyboardAwareBottomSheet>
    </SafeAreaView>
  );
}

function EditionStudioHeader({ issue }: { issue: MagazineIssue }) {
  const theme = useShoplyTheme();
  const items = issue.sections.flatMap((section) => section.items);
  const filled = items.filter((item) => item.reviewId).length;
  const progress = items.length ? filled / items.length : 0;
  return (
    <View
      style={[
        styles.studioHeader,
        {
          backgroundColor: theme.semantic.color.background,
          borderColor: theme.semantic.color.borderStrong
        }
      ]}
    >
      <View style={styles.studioHeaderTop}>
        <Button
          accessibilityLabel="잡지 상세로 돌아가기"
          icon={<ArrowLeft size={20} color={theme.semantic.color.text} />}
          onPress={() =>
            goBackOrReplace({
              pathname: "/magazine/[issueId]",
              params: { issueId: issue.id }
            })
          }
          size="icon"
          variant="tertiary"
        />
        <View style={{ flex: 1 }}>
          <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
            SHOPLY EDITION STUDIO
          </ShoplyText>
          <ShoplyText variant="labelLg" numberOfLines={1}>
            {issue.issueLabel} · {layoutName(issue.baseLayout)}
          </ShoplyText>
        </View>
        <View style={[styles.draftStamp, { borderColor: theme.semantic.color.primary }]}>
          <ShoplyText variant="caption" color="primary">
            DRAFT
          </ShoplyText>
        </View>
      </View>
      <View style={styles.studioProgressRow}>
        <ShoplyText variant="caption" color="textMuted">
          GRID COMPLETION
        </ShoplyText>
        <View
          style={[styles.studioProgressTrack, { backgroundColor: theme.semantic.color.border }]}
        >
          <View
            style={[
              styles.studioProgressFill,
              { backgroundColor: theme.semantic.color.primary, width: `${progress * 100}%` }
            ]}
          />
        </View>
        <ShoplyText variant="caption" color="primary">
          {filled}/{items.length}
        </ShoplyText>
      </View>
    </View>
  );
}

function MagazineGenerationState({ issue }: { issue: MagazineIssue }) {
  const theme = useShoplyTheme();
  return (
    <SafeAreaView
      accessibilityLabel={`${issue.issueLabel} 매거진 생성 중`}
      accessibilityLiveRegion="polite"
      style={[styles.generationState, { backgroundColor: theme.semantic.color.background }]}
    >
      <View style={styles.generationHeader}>
        <Button
          accessibilityLabel="쇼플리 매거진 목록으로 돌아가기"
          icon={<ArrowLeft size={20} color={theme.semantic.color.text} />}
          onPress={() => goBackOrReplace("/(tabs)/shoply")}
          size="icon"
          variant="tertiary"
        />
        <ShoplyWordmark width={104} />
      </View>
      <View style={styles.generationBody}>
        <View
          style={[styles.generationMonogram, { backgroundColor: theme.semantic.color.primarySoft }]}
        >
          <ShoplySMonogram size={156} color={theme.semantic.color.primary} />
        </View>
        <ActivityIndicator color={theme.semantic.color.primary} size="large" />
        <View style={styles.generationCopy}>
          <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
            {issue.issueLabel}
          </ShoplyText>
          <ShoplyText style={styles.generationTitle}>생성중입니다.</ShoplyText>
          <ShoplyText variant="bodyLg" color="textMuted" align="center">
            활동 기록과 취향을 고르고, 실제 잡지처럼 문장과 페이지를 편집하고 있어요.
          </ShoplyText>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MagazineHeader({
  issue,
  subscribing,
  deleting,
  onEdit,
  onDelete,
  onSubscribe
}: {
  issue: MagazineIssue;
  subscribing: boolean;
  deleting: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSubscribe: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.semantic.color.background,
          borderColor: theme.semantic.color.border
        }
      ]}
    >
      <Button
        accessibilityLabel="쇼플리 매거진 목록으로 돌아가기"
        icon={<ArrowLeft size={20} color={theme.semantic.color.text} />}
        onPress={() => goBackOrReplace("/(tabs)/shoply")}
        size="icon"
        variant="tertiary"
      />
      <View style={{ flex: 1 }}>
        <ShoplyText variant="labelLg" numberOfLines={1}>
          {issue.issueLabel}
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
          @{issue.owner.nickname}
        </ShoplyText>
      </View>
      {onEdit ? (
        <Button
          accessibilityLabel="이 에디션 편집하기"
          icon={<Edit3 size={16} color={theme.semantic.color.textInverse} />}
          label="편집"
          onPress={onEdit}
          size="sm"
        />
      ) : null}
      {onDelete ? (
        <Button
          accessibilityLabel="이 에디션 삭제하기"
          disabled={deleting}
          icon={<Trash2 size={17} color={theme.semantic.color.danger} />}
          onPress={onDelete}
          size="icon"
          variant="tertiary"
        />
      ) : null}
      {!issue.isOwner && issue.issueType === "custom" ? (
        <Button
          disabled={subscribing}
          icon={
            issue.isSubscribed ? (
              <Check size={16} color={theme.semantic.color.primary} />
            ) : (
              <BookmarkPlus size={16} color={theme.semantic.color.textInverse} />
            )
          }
          label={issue.isSubscribed ? "구독 중 · Pick" : "구독 + Pick"}
          onPress={onSubscribe}
          size="sm"
          variant={issue.isSubscribed ? "secondary" : "primary"}
        />
      ) : null}
    </View>
  );
}

function MagazineEditorPanel({
  issue,
  busy,
  onUpdate,
  onPublish
}: {
  issue: MagazineIssue;
  busy: boolean;
  onUpdate: (patch: UpdateMagazineRequest) => void | Promise<void>;
  onPublish: () => void;
}) {
  const theme = useShoplyTheme();
  const [title, setTitle] = useState(issue.revision.coverTitle ?? "");
  const [subtitle, setSubtitle] = useState(issue.revision.coverSubtitle ?? "");
  const [letter, setLetter] = useState(issue.revision.editorLetter ?? "");

  return (
    <View
      style={[
        styles.editorPanel,
        {
          backgroundColor: theme.semantic.color.background,
          borderColor: theme.semantic.color.primary
        }
      ]}
    >
      <View style={styles.editorHeading}>
        <View style={{ flex: 1 }}>
          <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>
            EDITOR DESK / 04
          </ShoplyText>
          <ShoplyText style={styles.editorTitle}>에디션 편집실</ShoplyText>
        </View>
        <Edit3 size={24} color={theme.semantic.color.primary} />
      </View>

      <EditorLabel label="기본 레이아웃" />
      <View style={styles.layoutChoices}>
        {(["atelier", "zine", "edit"] as MagazineLayout[]).map((layout) => (
          <LayoutChoice
            key={layout}
            layout={layout}
            selected={issue.baseLayout === layout}
            disabled={busy}
            onPress={() => onUpdate({ baseLayout: layout })}
          />
        ))}
      </View>

      <EditorLabel label="표지와 에디터 레터" />
      <EditorInput label="표지 제목" maxLength={18} value={title} onChangeText={setTitle} />
      <EditorInput label="표지 부제" maxLength={45} value={subtitle} onChangeText={setSubtitle} />
      <EditorInput
        label="에디터 레터"
        maxLength={MAGAZINE_EDITORIAL_TEXT_LIMITS[issue.baseLayout].editorLetter}
        multiline
        value={letter}
        onChangeText={setLetter}
      />
      <Button
        label="표지 문구 저장"
        variant="secondary"
        onPress={() =>
          onUpdate({
            coverTitle: title.trim(),
            coverSubtitle: subtitle.trim() || null,
            editorLetter: letter.trim() || null
          })
        }
      />

      <View style={[styles.rule, { backgroundColor: theme.semantic.color.border }]} />
      <EditorLabel label="콘텐츠 구성" />
      <ShoplyText variant="bodyMd" color="textMuted">
        지면의 빈 칸을 눌러 내 리뷰를 배치하세요. 리뷰를 고른 슬롯에만 문장이 한 번 생성되며,
        이후에는 직접 수정할 수 있습니다.
      </ShoplyText>

      <View style={[styles.rule, { backgroundColor: theme.semantic.color.border }]} />
      <ShoplyText variant="caption" color="textMuted">
        발행 전 광고·협찬·구매 인증과 원문 출처를 다시 확인해주세요. 발행본 수정은 새 리비전으로
        안전하게 저장됩니다.
      </ShoplyText>
      <Button
        disabled={busy}
        icon={<Send size={17} color={theme.semantic.color.textInverse} />}
        label={issue.status === "published" ? "수정본 재발행" : "잡지 발행하기"}
        onPress={onPublish}
      />
    </View>
  );
}

function EditorLabel({ label }: { label: string }) {
  return (
    <ShoplyText variant="labelLg" style={{ marginTop: 4 }}>
      {label}
    </ShoplyText>
  );
}

function LayoutChoice({
  layout,
  selected,
  disabled,
  onPress
}: {
  layout: MagazineLayout;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.layoutChoice,
        {
          backgroundColor: selected
            ? theme.semantic.color.primarySoft
            : theme.semantic.color.surface,
          borderColor: selected ? theme.semantic.color.primary : theme.semantic.color.border,
          opacity: pressed ? 0.7 : 1
        }
      ]}
    >
      <View style={styles.layoutMiniature}>
        {layout === "atelier" ? (
          <>
            <View
              style={[styles.layoutMiniLead, { backgroundColor: theme.semantic.color.primary }]}
            />
            <View
              style={[
                styles.layoutMiniSmall,
                { backgroundColor: theme.semantic.color.borderStrong }
              ]}
            />
          </>
        ) : layout === "zine" ? (
          <>
            <View
              style={[styles.layoutMiniZineOne, { backgroundColor: theme.semantic.color.primary }]}
            />
            <View
              style={[styles.layoutMiniZineTwo, { backgroundColor: theme.semantic.color.text }]}
            />
          </>
        ) : (
          <>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.layoutMiniEdit,
                  {
                    backgroundColor:
                      index === 0 ? theme.semantic.color.primary : theme.semantic.color.borderStrong
                  }
                ]}
              />
            ))}
          </>
        )}
      </View>
      <ShoplyText
        variant="caption"
        style={{ color: selected ? theme.semantic.color.primary : theme.semantic.color.text }}
      >
        {layoutName(layout)}
      </ShoplyText>
    </Pressable>
  );
}

function EditorInput({
  label,
  multiline,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const theme = useShoplyTheme();
  return (
    <View style={{ gap: 5 }}>
      <ShoplyText variant="caption" color="textMuted">
        {label}
      </ShoplyText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={theme.semantic.color.textMuted}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          { borderColor: theme.semantic.color.border, color: theme.semantic.color.text }
        ]}
      />
    </View>
  );
}

function layoutName(layout: MagazineLayout) {
  if (layout === "atelier") return "Atelier";
  if (layout === "zine") return "Zine";
  return "Edit";
}

const styles = StyleSheet.create({
  draftStamp: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 9
  },
  editorHeading: { alignItems: "center", flexDirection: "row", gap: 12 },
  editorPanel: {
    borderTopWidth: 4,
    gap: 13,
    marginTop: 42,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 20
  },
  editorTitle: {
    fontFamily: "Georgia",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 34
  },
  eyebrow: { letterSpacing: 1.4 },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12
  },
  generationBody: { alignItems: "center", flex: 1, gap: 20, justifyContent: "center", padding: 28 },
  generationCopy: { alignItems: "center", gap: 8, maxWidth: 330 },
  generationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12
  },
  generationMonogram: {
    alignItems: "center",
    height: 220,
    justifyContent: "center",
    overflow: "hidden",
    width: 220
  },
  generationState: { flex: 1 },
  generationTitle: { fontFamily: "Georgia", fontSize: 36, fontWeight: "700", lineHeight: 42 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  layoutChoice: {
    alignItems: "center",
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 112,
    padding: 8
  },
  layoutChoices: { flexDirection: "row", gap: 8 },
  layoutLoadingOverlay: {
    alignItems: "center",
    bottom: 0,
    gap: 12,
    justifyContent: "center",
    left: 0,
    opacity: 0.96,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 30
  },
  layoutMiniature: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: 62,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  layoutMiniEdit: { height: 26, margin: 1, width: "44%" },
  layoutMiniLead: { height: 54, left: 1, position: "absolute", top: 1, width: "62%" },
  layoutMiniSmall: { bottom: 1, height: 25, position: "absolute", right: 1, width: "32%" },
  layoutMiniZineOne: {
    height: 47,
    left: 5,
    position: "absolute",
    top: 4,
    transform: [{ rotate: "-4deg" }],
    width: "52%"
  },
  layoutMiniZineTwo: {
    bottom: 3,
    height: 34,
    position: "absolute",
    right: 4,
    transform: [{ rotate: "5deg" }],
    width: "38%"
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    maxHeight: "80%",
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 22
  },
  sheetFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  sourceCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingBottom: 14,
    width: "48%"
  },
  sourceList: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 24 },
  sourceSelectMark: {
    bottom: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: "absolute"
  },
  sourceSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
    height: "88%",
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 22
  },
  sourceSheetTitle: {
    fontFamily: "Georgia",
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 33
  },
  sourceThumb: { aspectRatio: 0.82, overflow: "hidden", width: "100%" },
  state: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center", padding: 24 },
  studioHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 6
  },
  studioHeaderTop: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 52 },
  studioProgressFill: { height: 3 },
  studioProgressRow: { alignItems: "center", flexDirection: "row", gap: 9, paddingHorizontal: 8 },
  studioProgressTrack: { flex: 1, height: 3, overflow: "hidden" },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 17,
    lineHeight: 25,
    minHeight: 150,
    padding: 14,
    textAlignVertical: "top"
  }
});
