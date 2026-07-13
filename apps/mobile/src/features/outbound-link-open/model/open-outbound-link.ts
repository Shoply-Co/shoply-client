import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { apiRequest } from "@/shared/api/client";
import { ReviewLinkSticker } from "@/entities/review";

export async function openOutboundReviewLink(sticker: ReviewLinkSticker) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  try {
    await apiRequest(`/review-links/${sticker.id}/clicks`, {
      method: "POST",
      body: JSON.stringify({
        sourceSurface: "review_detail"
      })
    });
  } catch {
    // Click tracking must not block the user from reaching the merchant.
  }

  await Linking.openURL(sticker.url);
}
