import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEvent } from "expo";
import { ImageIcon, Images, Play } from "lucide-react-native";
import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { isLikelyVideoUrl } from "../lib/media-url";
import { ReviewSummary } from "../model/types";
import { DisclosureBadge } from "./disclosure-badge";

interface ReviewTileProps {
  review: ReviewSummary;
  columns: 2 | 3;
  videoPreviewActive?: boolean;
  onPress?: () => void;
}

export function ReviewTile({
  review,
  columns,
  videoPreviewActive = false,
  onPress
}: ReviewTileProps) {
  const theme = useShoplyTheme();
  const showText = columns === 2;
  const primaryMedia = review.media[0];
  const mediaType = primaryMedia?.mediaType ?? review.mediaType;
  const posterCandidate = primaryMedia?.thumbnailUrl ?? primaryMedia?.previewUrl ?? review.mediaUrl;
  const posterUrl =
    posterCandidate && !isLikelyVideoUrl(posterCandidate) ? posterCandidate : undefined;
  const videoUrl = mediaType === "video" ? (primaryMedia?.url ?? review.mediaUrl) : undefined;
  const shouldRenderVideoTile = mediaType === "video" && Boolean(videoUrl);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${review.productName} 리뷰 보기`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        {
          opacity: pressed ? 0.82 : 1,
          margin: columns === 2 ? 4 : 1.5
        }
      ]}
    >
      <View
        style={[
          styles.mediaWrap,
          {
            borderRadius: columns === 2 ? theme.semantic.radius.sm : 4,
            backgroundColor: theme.semantic.color.surfaceMuted
          }
        ]}
      >
        {shouldRenderVideoTile && videoUrl ? (
          <ReviewVideoThumbnail uri={videoUrl} posterUrl={posterUrl} active={videoPreviewActive} />
        ) : posterUrl ? (
          <ExpoImage
            source={{ uri: posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            enableLiveTextInteraction={false}
          />
        ) : (
          <View style={styles.mediaFallback}>
            <ImageIcon size={22} color={theme.semantic.color.textMuted} />
            <ShoplyText variant="caption" color="textMuted" align="center" numberOfLines={2}>
              {review.productName}
            </ShoplyText>
          </View>
        )}
        <View style={styles.topSignals}>
          {mediaType === "video" ? (
            <View style={styles.signal}>
              <Play size={13} color="white" fill="white" />
            </View>
          ) : null}
          {review.media.length > 1 ? (
            <View style={styles.signalWide}>
              <Images size={13} color="white" />
              <ShoplyText variant="caption" style={styles.signalText}>
                {review.media.length}
              </ShoplyText>
            </View>
          ) : null}
        </View>
        {showText && review.creatorBadge ? (
          <View style={styles.statusBadge}>
            <ShoplyText variant="caption" style={styles.statusBadgeText} numberOfLines={1}>
              {review.creatorBadge}
            </ShoplyText>
          </View>
        ) : null}
      </View>
      {showText ? (
        <View style={styles.textBlock}>
          <ShoplyText variant="labelMd" numberOfLines={1}>
            {review.productName}
          </ShoplyText>
          <View style={styles.metaLine}>
            {review.brandName ? (
              <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
                {review.brandName}
              </ShoplyText>
            ) : null}
            <DisclosureBadge state={review.disclosureState} compact />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function ReviewVideoThumbnail({
  uri,
  posterUrl,
  active
}: {
  uri: string;
  posterUrl?: string | null;
  active: boolean;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const previewFailed = failedUri === uri;
  const handlePreviewError = useCallback(() => {
    setFailedUri(uri);
  }, [uri]);

  if (previewFailed) return <ReviewVideoPoster posterUrl={posterUrl} />;

  return (
    <ReviewVideoErrorBoundary
      key={uri}
      fallback={<ReviewVideoPoster posterUrl={posterUrl} />}
      onError={handlePreviewError}
    >
      <ReviewAutoPreviewVideo uri={uri} active={active} onError={handlePreviewError} />
    </ReviewVideoErrorBoundary>
  );
}

function ReviewVideoPoster({ posterUrl }: { posterUrl?: string | null }) {
  if (posterUrl) {
    return (
      <ExpoImage
        source={{ uri: posterUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        enableLiveTextInteraction={false}
      />
    );
  }

  return (
    <View style={styles.videoPosterFallback}>
      <Play size={24} color="white" fill="white" />
    </View>
  );
}

function ReviewAutoPreviewVideo({
  uri,
  active,
  onError
}: {
  uri: string;
  active: boolean;
  onError: () => void;
}) {
  const source = useMemo(
    () => ({ uri, contentType: "progressive" as const, useCaching: true }),
    [uri]
  );
  const player = useVideoPlayer(source, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.keepScreenOnWhilePlaying = false;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    if (status === "error") {
      onError();
      return;
    }
    if (status !== "readyToPlay") return;

    try {
      player.muted = true;
      if (active) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      onError();
    }
  }, [active, onError, player, status]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // The native player may already be released while a recycled tile is unmounting.
      }
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsVideoFrameAnalysis={false}
      allowsPictureInPicture={false}
      fullscreenOptions={videoThumbnailFullscreenOptions}
      showsTimecodes={false}
    />
  );
}

class ReviewVideoErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const videoThumbnailFullscreenOptions = { enable: false };

const styles = StyleSheet.create({
  wrap: {
    flex: 1
  },
  mediaWrap: {
    aspectRatio: 3 / 4,
    overflow: "hidden"
  },
  topSignals: {
    flexDirection: "row",
    gap: 5,
    position: "absolute",
    right: 8,
    top: 8
  },
  mediaFallback: {
    alignItems: "center",
    flex: 1,
    gap: 6,
    justifyContent: "center",
    padding: 8
  },
  videoPosterFallback: {
    alignItems: "center",
    backgroundColor: "rgba(5, 5, 7, 0.72)",
    flex: 1,
    justifyContent: "center"
  },
  signal: {
    alignItems: "center",
    backgroundColor: "rgba(98, 102, 241, 0.86)",
    borderRadius: 999,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  signalWide: {
    alignItems: "center",
    backgroundColor: "rgba(26, 184, 134, 0.86)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 3,
    height: 26,
    justifyContent: "center",
    minWidth: 34,
    paddingHorizontal: 7
  },
  signalText: {
    color: "white"
  },
  statusBadge: {
    backgroundColor: "rgba(255, 107, 143, 0.88)",
    borderRadius: 999,
    bottom: 8,
    left: 8,
    maxWidth: "72%",
    minHeight: 24,
    paddingHorizontal: 8,
    position: "absolute",
    justifyContent: "center"
  },
  statusBadgeText: {
    color: "white"
  },
  textBlock: {
    gap: 5,
    paddingHorizontal: 2,
    paddingTop: 8
  },
  metaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "space-between"
  }
});
