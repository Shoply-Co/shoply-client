import { DisclosureState } from "./types";

export const disclosureLabel: Record<DisclosureState, string> = {
  none: "",
  direct_purchase: "구매인증",
  affiliate: "제휴 링크",
  sponsored: "협찬",
  ad: "광고",
  provided: "제공받은 상품"
};
