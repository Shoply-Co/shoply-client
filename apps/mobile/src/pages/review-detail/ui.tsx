import { useLocalSearchParams } from "expo-router";
import { ReviewDetailViewer } from "@/widgets/review-detail-viewer";

export function ReviewDetailPage() {
  const { reviewId, feedKey } = useLocalSearchParams<{ reviewId?: string; feedKey?: string }>();
  return <ReviewDetailViewer reviewId={reviewId} feedKey={feedKey} />;
}
