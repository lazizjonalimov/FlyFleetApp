import { ConsoleProvider } from "@/features/console/console-provider";
import { SurfaceFrame } from "@/features/console/surface-frame";

/** Surfaces outside the workspace: sign-in, the customer portal, an owner's portal and the states reference. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <ConsoleProvider>
      <SurfaceFrame>{children}</SurfaceFrame>
    </ConsoleProvider>
  );
}
