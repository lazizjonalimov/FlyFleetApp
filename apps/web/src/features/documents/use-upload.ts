"use client";

import { useCallback } from "react";
import { useAction } from "@/features/console/use-action";
import { useConsole } from "@/features/console/console-provider";
import { ACCEPT, checkFile, uploadDocument, type DocumentType, type EntityType } from "@/lib/upload";

/** Asks for a file with the browser's own picker. Resolves to nothing when the person cancels. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Opens a document in a new tab. The file is served by the API to people who may read it. */
export const viewDocument = (id: string) => window.open(`/api/v1/documents/${id}/download`, "_blank", "noopener");

/**
 * Attaching a document to a record: pick a file, check it, send it. The record's screens see it once the
 * server has confirmed the upload.
 */
export function useUpload() {
  const act = useAction();
  const { notify } = useConsole();
  return useCallback(
    async (target: { type: DocumentType; entityType: EntityType; entityId: string; label: string; expiresOn?: string | null }) => {
      const file = await pickFile();
      if (!file) return;
      const problem = checkFile(file);
      if (problem) return notify(problem, true);
      await act(() => uploadDocument({ file, type: target.type, entityType: target.entityType, entityId: target.entityId, expiresOn: target.expiresOn }), `${target.label} uploaded`);
    },
    [act, notify],
  );
}
