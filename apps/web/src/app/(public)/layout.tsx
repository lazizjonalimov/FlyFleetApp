import { SurfaceFrame } from "@/features/console/surface-frame";

/** Surfaces outside a company's workspace: sign-in and sign-up. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <SurfaceFrame>{children}</SurfaceFrame>;
}
