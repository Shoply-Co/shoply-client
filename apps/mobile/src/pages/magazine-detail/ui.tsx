import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { ArrowLeft, BookmarkPlus, Check, Edit3, Plus, Send, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  Chip,
  KeyboardAwareBottomSheet,
  ShoplyText,
  useShoplyTheme
} from "@shoply/design-system";
import {
  useMagazineIssue,
  useCustomMagazineSources,
  type MagazineEditorialBlock,
  type MagazineIssue,
  type MagazineLayout
} from "@/entities/magazine";
import {
  usePublishMagazine,
  useRegenerateMagazineBlock,
  useUpdateMagazine,
  useUpdateMagazineBlock,
  useUpdateMagazineItems,
  useUpsertMagazineDeal
} from "@/features/magazine-edit";
import { useMagazineSubscription } from "@/features/magazine-subscribe";
import { userFacingErrorMessage } from "@/shared/api/errors";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { MagazineIssueViewer } from "@/widgets/magazine-issue-viewer";

export function MagazineDetailPage() {
  const { issueId } = useLocalSearchParams<{ issueId?: string }>();
  const theme = useShoplyTheme();
  const query = useMagazineIssue(issueId);
  const updateMagazine = useUpdateMagazine();
  const updateBlock = useUpdateMagazineBlock();
  const regenerateBlock = useRegenerateMagazineBlock();
  const updateItems = useUpdateMagazineItems();
  const publish = usePublishMagazine();
  const subscription = useMagazineSubscription();
  const [editingBlock, setEditingBlock] = useState<MagazineEditorialBlock | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceSectionId, setSourceSectionId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
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
  const editable = issue.isOwner && issue.issueType === "custom";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.semantic.color.background }} edges={["top"]}>
      <MagazineIssueViewer
        issue={issue}
        regeneratingBlockId={regenerateBlock.variables?.blockId ?? null}
        onEditBlock={editable ? setEditingBlock : undefined}
        onRegenerateBlock={editable ? (block) => regenerateBlock.mutate({ issueId: issue.id, blockId: block.id }) : undefined}
        onChangeCrop={editable ? (itemId, cropPayload) => updateItems.mutate({
          issueId: issue.id,
          items: issue.sections.flatMap((section) => section.items.map((item) => ({
            itemId: item.id,
            sectionId: section.id,
            sortOrder: item.sortOrder,
            ...(item.id === itemId ? { cropPayload } : {})
          })))
        }) : undefined}
        onMoveItem={editable ? (sectionId, itemId, direction) => {
          const section = issue.sections.find((candidate) => candidate.id === sectionId);
          if (!section) return;
          const ordered = [...section.items].sort((left, right) => left.sortOrder - right.sortOrder);
          const currentIndex = ordered.findIndex((item) => item.id === itemId);
          const nextIndex = currentIndex + direction;
          if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
          [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex]!, ordered[currentIndex]!];
          const orderById = new Map(ordered.map((item, index) => [item.id, index]));
          updateItems.mutate({
            issueId: issue.id,
            items: issue.sections.flatMap((candidate) => candidate.items.map((item) => ({
              itemId: item.id,
              sectionId: candidate.id,
              sortOrder: candidate.id === sectionId ? orderById.get(item.id) ?? item.sortOrder : item.sortOrder
            })))
          });
        } : undefined}
        onRemoveItem={editable ? (itemId) => {
          const total = issue.sections.reduce((sum, section) => sum + section.items.length, 0);
          if (total <= 4) {
            Alert.alert("최소 4개의 리뷰가 필요해요", "다른 리뷰를 추가한 뒤 이 아이템을 제거해주세요.");
            return;
          }
          Alert.alert("이 아이템을 잡지에서 뺄까요?", "원본 리뷰와 보관·좋아요 상태는 바뀌지 않습니다.", [
            { text: "취소", style: "cancel" },
            {
              text: "제거",
              style: "destructive",
              onPress: () => updateItems.mutate({
                issueId: issue.id,
                items: issue.sections.flatMap((section) => section.items
                  .filter((item) => item.id !== itemId)
                  .map((item, index) => ({ itemId: item.id, sectionId: section.id, sortOrder: index })))
              })
            }
          ]);
        } : undefined}
        header={
          <MagazineHeader
            issue={issue}
            subscribing={subscription.isPending}
            onSubscribe={() => subscription.mutate({ seriesId: issue.owner.userId, subscribed: issue.isSubscribed })}
          />
        }
        footer={editable ? (
          <MagazineEditorPanel
            issue={issue}
            busy={updateMagazine.isPending || updateItems.isPending || publish.isPending}
            onUpdate={(patch) => updateMagazine.mutate({ issueId: issue.id, patch })}
            onPublish={() => {
              Alert.alert("이 잡지를 발행할까요?", "발행하면 다른 사용자가 보고 구독할 수 있어요.", [
                { text: "취소", style: "cancel" },
                { text: "발행", onPress: () => publish.mutate(issue.id) }
              ]);
            }}
            onAddContent={() => {
              setSourceSectionId(issue.sections[0]?.id ?? null);
              setSourcesOpen(true);
            }}
          />
        ) : null}
      />

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
          <Button size="icon" variant="tertiary" accessibilityLabel="문장 편집 닫기" icon={<X size={18} color={theme.semantic.color.text} />} onPress={() => setEditingBlock(null)} />
        </View>
        <TextInput
          accessibilityLabel="에디토리얼 문장"
          multiline
          maxLength={editingBlock?.blockType === "caption" ? 60 : 150}
          onChangeText={setDraftText}
          placeholder="잡지 문장을 입력하세요"
          placeholderTextColor={theme.semantic.color.textMuted}
          style={[styles.textArea, { borderColor: theme.semantic.color.border, color: theme.semantic.color.text }]}
          value={draftText}
        />
        <View style={styles.sheetFooter}>
          <ShoplyText variant="caption" color="textMuted">
            {draftText.length}/{editingBlock?.blockType === "caption" ? 60 : 150}
          </ShoplyText>
          <Button
            disabled={!editingBlock || !draftText.trim() || updateBlock.isPending}
            label={updateBlock.isPending ? "저장 중" : "문장 저장"}
            onPress={async () => {
              if (!editingBlock) return;
              await updateBlock.mutateAsync({ issueId: issue.id, blockId: editingBlock.id, text: draftText.trim() });
              setEditingBlock(null);
            }}
          />
        </View>
      </KeyboardAwareBottomSheet>

      <KeyboardAwareBottomSheet
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        accessibilityLabel="콘텐츠 선택 닫기"
        contentStyle={[styles.sourceSheet, { backgroundColor: theme.semantic.color.surface }]}
      >
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleMd">리뷰 추가</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">내 게시물과 좋아요·보관한 리뷰만 표시됩니다.</ShoplyText>
          </View>
          <Button size="icon" variant="tertiary" accessibilityLabel="콘텐츠 선택 닫기" icon={<X size={18} color={theme.semantic.color.text} />} onPress={() => setSourcesOpen(false)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {issue.sections.map((section) => (
            <Chip key={section.id} label={section.title} selected={sourceSectionId === section.id} onPress={() => setSourceSectionId(section.id)} />
          ))}
        </ScrollView>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sourceList} keyboardShouldPersistTaps="handled">
          {(sourceQuery.data ?? []).filter((source) => !issue.sections.some((section) => section.items.some((item) => item.reviewId === source.reviewId))).map((source) => (
            <View key={source.reviewId} style={[styles.sourceCard, { borderColor: theme.semantic.color.border }]}>
              <View style={[styles.sourceThumb, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
                {source.mediaUrl ? <Image accessibilityLabel="추가할 리뷰 사진" contentFit="cover" source={{ uri: source.mediaUrl }} style={StyleSheet.absoluteFill} /> : null}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <ShoplyText variant="labelLg" numberOfLines={2}>{source.productName ?? source.title ?? "리뷰 아이템"}</ShoplyText>
                <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>{source.brandName ?? "브랜드 미지정"} · @{source.authorNickname}</ShoplyText>
              </View>
              <Button
                accessibilityLabel={`${source.productName ?? source.title ?? "리뷰"} 추가`}
                disabled={!sourceSectionId || updateItems.isPending || issue.sections.reduce((sum, section) => sum + section.items.length, 0) >= 20}
                label="추가"
                size="sm"
                onPress={async () => {
                  if (!sourceSectionId) return;
                  const targetCount = issue.sections.find((section) => section.id === sourceSectionId)?.items.length ?? 0;
                  await updateItems.mutateAsync({
                    issueId: issue.id,
                    items: [
                      ...issue.sections.flatMap((section) => section.items.map((item) => ({ itemId: item.id, sectionId: section.id, sortOrder: item.sortOrder }))),
                      { reviewId: source.reviewId, sectionId: sourceSectionId, sortOrder: targetCount }
                    ]
                  });
                  setSourcesOpen(false);
                }}
              />
            </View>
          ))}
          {sourceQuery.isPending ? <ActivityIndicator color={theme.semantic.color.primary} /> : null}
          {!sourceQuery.isPending && !(sourceQuery.data ?? []).length ? (
            <ShoplyText color="textMuted" align="center">추가할 수 있는 리뷰가 아직 없어요.</ShoplyText>
          ) : null}
        </ScrollView>
      </KeyboardAwareBottomSheet>
    </SafeAreaView>
  );
}

function MagazineHeader({
  issue,
  subscribing,
  onSubscribe
}: {
  issue: MagazineIssue;
  subscribing: boolean;
  onSubscribe: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.header, { backgroundColor: theme.semantic.color.background, borderColor: theme.semantic.color.border }]}>
      <Button
        accessibilityLabel="쇼플리 매거진 목록으로 돌아가기"
        icon={<ArrowLeft size={20} color={theme.semantic.color.text} />}
        onPress={() => goBackOrReplace("/(tabs)/shoply")}
        size="icon"
        variant="tertiary"
      />
      <View style={{ flex: 1 }}>
        <ShoplyText variant="labelLg" numberOfLines={1}>{issue.issueLabel}</ShoplyText>
        <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>@{issue.owner.nickname}</ShoplyText>
      </View>
      {!issue.isOwner && issue.issueType === "custom" ? (
        <Button
          disabled={subscribing}
          icon={issue.isSubscribed ? <Check size={16} color={theme.semantic.color.primary} /> : <BookmarkPlus size={16} color={theme.semantic.color.textInverse} />}
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
  onPublish,
  onAddContent
}: {
  issue: MagazineIssue;
  busy: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
  onPublish: () => void;
  onAddContent: () => void;
}) {
  const theme = useShoplyTheme();
  const deal = useUpsertMagazineDeal();
  const [title, setTitle] = useState(issue.revision.coverTitle ?? "");
  const [subtitle, setSubtitle] = useState(issue.revision.coverSubtitle ?? "");
  const [letter, setLetter] = useState(issue.revision.editorLetter ?? "");
  const [focusSectionId, setFocusSectionId] = useState(issue.sections.find((section) => section.layoutOverride)?.id ?? issue.sections[0]?.id ?? null);
  const [discount, setDiscount] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  return (
    <View style={[styles.editorPanel, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      <View style={styles.editorHeading}>
        <View style={{ flex: 1 }}>
          <ShoplyText variant="caption" color="primary" style={styles.eyebrow}>EDITOR DESK</ShoplyText>
          <ShoplyText variant="titleLg">내 커스텀 잡지 편집</ShoplyText>
        </View>
        <Edit3 size={24} color={theme.semantic.color.primary} />
      </View>

      <EditorLabel label="기본 레이아웃" />
      <View style={styles.chipRow}>
        {(["atelier", "zine", "edit"] as MagazineLayout[]).map((layout) => (
          <Chip key={layout} label={layoutName(layout)} selected={issue.baseLayout === layout} onPress={() => onUpdate({ baseLayout: layout })} />
        ))}
      </View>

      <EditorLabel label="강조할 섹션 · 최대 1개" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {issue.sections.map((section) => (
          <Chip key={section.id} label={section.title} selected={focusSectionId === section.id} onPress={() => setFocusSectionId(section.id)} />
        ))}
      </ScrollView>
      {focusSectionId ? (
        <View style={styles.chipRow}>
          {(["atelier", "zine", "edit"] as MagazineLayout[]).map((layout) => (
            <Button
              key={layout}
              label={layoutName(layout)}
              size="sm"
              variant="secondary"
              onPress={() => onUpdate({ sectionLayoutOverride: { sectionId: focusSectionId, layout } })}
            />
          ))}
          <Button label="해제" size="sm" variant="tertiary" onPress={() => onUpdate({ sectionLayoutOverride: { sectionId: focusSectionId, layout: null } })} />
        </View>
      ) : null}

      <EditorLabel label="표지와 에디터 레터" />
      <EditorInput label="표지 제목" maxLength={18} value={title} onChangeText={setTitle} />
      <EditorInput label="표지 부제" maxLength={45} value={subtitle} onChangeText={setSubtitle} />
      <EditorInput label="에디터 레터" maxLength={500} multiline value={letter} onChangeText={setLetter} />
      <Button
        label="표지 문구 저장"
        variant="secondary"
        onPress={() => onUpdate({ coverTitle: title.trim(), coverSubtitle: subtitle.trim() || null, editorLetter: letter.trim() || null })}
      />

      <View style={[styles.rule, { backgroundColor: theme.semantic.color.border }]} />
      <EditorLabel label="콘텐츠 구성" />
      <Button icon={<Plus size={16} color={theme.semantic.color.primary} />} label="좋아요·보관·내 리뷰에서 추가" variant="secondary" onPress={onAddContent} />
      <ShoplyText variant="caption" color="textMuted">각 페이지의 화살표로 순서를 바꾸고, 휴지통 버튼으로 제거할 수 있습니다.</ShoplyText>

      <View style={[styles.rule, { backgroundColor: theme.semantic.color.border }]} />
      <EditorLabel label="이번 호 특가 · 에디터 제공 정보" />
      <View style={styles.inlineFields}>
        <View style={{ flex: 0.4 }}><EditorInput keyboardType="number-pad" label="할인율 %" maxLength={3} value={discount} onChangeText={setDiscount} /></View>
        <View style={{ flex: 1 }}><EditorInput label="종료일 YYYY-MM-DD" value={endDate} onChangeText={setEndDate} /></View>
      </View>
      <EditorInput autoCapitalize="none" keyboardType="url" label="출처 URL" value={sourceUrl} onChangeText={setSourceUrl} />
      <Button
        disabled={deal.isPending || !validDeal(discount, endDate, sourceUrl)}
        label={deal.isPending ? "특가 저장 중" : "특가 정보 추가"}
        variant="secondary"
        onPress={async () => {
          const end = new Date(`${endDate}T23:59:59+09:00`);
          await deal.mutateAsync({
            issueId: issue.id,
            deal: {
              discountPercent: Number(discount),
              startsAt: new Date().toISOString(),
              endsAt: end.toISOString(),
              sourceUrl
            }
          });
          setDiscount("");
          setEndDate("");
          setSourceUrl("");
        }}
      />

      <View style={[styles.rule, { backgroundColor: theme.semantic.color.border }]} />
      <ShoplyText variant="caption" color="textMuted">
        발행 전 광고·협찬·구매 인증과 원문 출처를 다시 확인해주세요. 발행본 수정은 새 리비전으로 안전하게 저장됩니다.
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
  return <ShoplyText variant="labelLg" style={{ marginTop: 4 }}>{label}</ShoplyText>;
}

function EditorInput({ label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const theme = useShoplyTheme();
  return (
    <View style={{ gap: 5 }}>
      <ShoplyText variant="caption" color="textMuted">{label}</ShoplyText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={theme.semantic.color.textMuted}
        style={[styles.input, multiline ? styles.multiline : null, { borderColor: theme.semantic.color.border, color: theme.semantic.color.text }]}
      />
    </View>
  );
}

function layoutName(layout: MagazineLayout) {
  if (layout === "atelier") return "Atelier";
  if (layout === "zine") return "Zine";
  return "Edit";
}

function validDeal(discount: string, endDate: string, sourceUrl: string) {
  const amount = Number(discount);
  const end = new Date(`${endDate}T23:59:59+09:00`);
  return amount >= 1 && amount <= 100 && Number.isFinite(end.getTime()) && end > new Date() && /^https:\/\//i.test(sourceUrl);
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  editorHeading: { alignItems: "center", flexDirection: "row", gap: 12 },
  editorPanel: { gap: 13, marginTop: 34, padding: 20 },
  eyebrow: { letterSpacing: 1.4 },
  header: { alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 12 },
  inlineFields: { flexDirection: "row", gap: 10 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14, maxHeight: "80%", padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 22 },
  sheetFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  sourceCard: { alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, paddingVertical: 10 },
  sourceList: { paddingBottom: 24 },
  sourceSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12, height: "82%", padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 22 },
  sourceThumb: { height: 72, overflow: "hidden", width: 58 },
  state: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center", padding: 24 },
  textArea: { borderRadius: 12, borderWidth: 1, fontSize: 17, lineHeight: 25, minHeight: 150, padding: 14, textAlignVertical: "top" }
});
