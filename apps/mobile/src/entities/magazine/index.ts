export {
  magazineKeys,
  useCustomMagazineSources,
  useDiscoverMagazines,
  useMagazineGenerationJob,
  useMagazineIssue,
  useMyMagazines,
  useSubscribedMagazines
} from "./api/magazine-queries";
export type {
  MagazineDeal,
  MagazineCustomSource,
  MagazineEditorialBlock,
  MagazineIssue,
  MagazineItem,
  MagazineItemFacts,
  MagazineLayout,
  MagazineSection,
  MagazineSummary
} from "@/shared/api/generated/shoply";
