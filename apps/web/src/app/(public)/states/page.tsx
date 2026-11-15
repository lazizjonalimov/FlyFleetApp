import type { Metadata } from "next";
import { StatesGallery } from "@/features/states/states-gallery";

export const metadata: Metadata = { title: "Interface states" };

export default function StatesPage() {
  return <StatesGallery />;
}
