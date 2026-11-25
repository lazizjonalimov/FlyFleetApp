"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useConsole } from "@/features/console/console-provider";
import { errorMessage, toApiError } from "@/lib/api/errors";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Why a picture can't be used, before it is sent. The API checks the same things, and the picture itself. */
export function checkPhoto(file: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Use a JPEG, PNG or WebP picture";
  if (file.size === 0) return "That file is empty";
  if (file.size > PHOTO_MAX_BYTES) return "Photos can be up to 5 MB";
  return null;
}

/** The signed-in person's picture, or their initials when they have none. */
export function Avatar({ size = "md", className }: { size?: "md" | "lg" | "xl"; className?: string }) {
  const { user } = useConsole();
  return (
    <span className={clsx("av me", size, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small private picture from the API, already sized */}
      {user.photo ? <img src={user.photo} alt="" /> : <span>{user.ini}</span>}
    </span>
  );
}

/**
 * Choosing, uploading and removing your profile photo. `input` is a hidden file input to render somewhere that
 * stays mounted (a menu that closes would take it with it); `pick` opens the file chooser.
 */
export function usePhotoUpload() {
  const { notify } = useConsole();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);

  const upload = useCallback(
    async (file: File) => {
      const problem = checkPhoto(file);
      if (problem) return notify(problem, true);
      setPending("upload");
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/v1/auth/me/photo", { method: "PUT", body, credentials: "same-origin" });
        if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
        notify("Profile photo updated");
        router.refresh();
      } catch (error) {
        notify(errorMessage(error), true);
      }
      setPending(null);
    },
    [notify, router],
  );

  const remove = useCallback(async () => {
    setPending("remove");
    try {
      const response = await fetch("/api/v1/auth/me/photo", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
      notify("Profile photo removed");
      router.refresh();
    } catch (error) {
      notify(errorMessage(error), true);
    }
    setPending(null);
  }, [notify, router]);

  const input = (
    <input
      ref={ref}
      type="file"
      accept={PHOTO_TYPES.join(",")}
      hidden
      aria-hidden="true"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }}
    />
  );

  return { input, pick: () => ref.current?.click(), remove, pending };
}
