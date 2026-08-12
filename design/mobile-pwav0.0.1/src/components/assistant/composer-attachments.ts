import type {
  AppendMessage,
  AttachmentAdapter,
} from "@assistant-ui/react";
import type { AssistantAttachment } from "./assistant-state";

export const MAX_ASSISTANT_ATTACHMENTS = 8;
export const MAX_ASSISTANT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type AttachmentPickerOptions = {
  composer: ComposerAttachmentController;
};

type ComposerAttachmentController = {
  getState: () => { attachments: readonly unknown[]; attachmentAccept: string };
  addAttachment: (file: File) => Promise<void>;
};

type ComposerHydrationController = {
  setText: (text: string) => void;
};

export type AssistantComposerHydration = { current: Promise<void> | null };

function attachmentId(file: File) {
  return globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.lastModified}-${Math.random()}`;
}

export const assistantAttachmentAdapter = {
  accept: "*",
  async add({ file }) {
    if (file.size > MAX_ASSISTANT_ATTACHMENT_BYTES) {
      throw new Error("Ce fichier dépasse la limite de 25 Mio.");
    }
    return {
      id: attachmentId(file),
      type: file.type.startsWith("image/") ? "image" : "file",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(attachment) {
    return { ...attachment, status: { type: "complete" }, content: [] };
  },
  async remove() {
    // Les fichiers ne quittent jamais cette maquette locale avant l'envoi.
  },
} satisfies AttachmentAdapter;

export async function addAcceptedAttachments(
  composer: ComposerAttachmentController,
  files: Iterable<File>,
) {
  const remaining = Math.max(
    0,
    MAX_ASSISTANT_ATTACHMENTS - composer.getState().attachments.length,
  );
  const accepted = Array.from(files)
    .filter((file) => file.size <= MAX_ASSISTANT_ATTACHMENT_BYTES)
    .slice(0, remaining);

  for (const file of accepted) await composer.addAttachment(file);
  return accepted;
}

export function openAssistantAttachmentPicker({
  composer,
}: AttachmentPickerOptions) {
  let input: HTMLInputElement | null = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  const accept = composer.getState().attachmentAccept;
  if (accept !== "*") input.accept = accept;
  document.body.appendChild(input);

  let active = true;
  const removeInput = () => {
    const currentInput = input;
    if (!currentInput) return;
    currentInput.onchange = null;
    currentInput.oncancel = null;
    currentInput.remove();
    input = null;
  };
  // Browser tabs restore their own input session after the native file picker
  // and must not be disturbed, so settling is only detaching the file input.
  const settlePicker = () => {
    if (!active) return;
    active = false;
    removeInput();
  };

  input.onchange = async (event) => {
    const picker = event.currentTarget as HTMLInputElement;
    const files = picker.files ? Array.from(picker.files) : [];
    settlePicker();
    try {
      await addAcceptedAttachments(composer, files);
    } catch {
      // L'adaptateur publie son état d'erreur, le picker n'a rien à conserver.
    }
  };
  input.oncancel = () => {
    settlePicker();
  };
  input.click();

  return () => {
    active = false;
    removeInput();
  };
}

export function toAssistantAttachments(
  attachments: readonly { id: string; name: string; file?: File }[],
  persisted: readonly AssistantAttachment[],
): AssistantAttachment[] {
  const persistedSizes = new Map(persisted.map((attachment) => [attachment.id, attachment.size]));
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    size: attachment.file?.size ?? persistedSizes.get(attachment.id) ?? 0,
  }));
}

/**
 * React StrictMode rejoue les effects sans recréer les refs. Une seule promesse
 * d'hydratation est donc partagée par les deux setups, et le deuxième setup
 * peut encore signaler la fin lorsque le premier a déjà été nettoyé. Les
 * pièces jointes ne sont pas restaurées : localStorage ne contient pas le
 * File, donc les réafficher les rendrait faussement envoyables.
 */
export function hydrateAssistantComposerOnce(
  hydration: AssistantComposerHydration,
  composer: ComposerHydrationController,
  draft: string,
) {
  if (hydration.current) return hydration.current;
  hydration.current = Promise.resolve().then(() => {
    composer.setText(draft);
  });
  return hydration.current;
}

export function attachmentsFromAppendMessage(
  message: AppendMessage,
  persisted: readonly AssistantAttachment[] = [],
): AssistantAttachment[] {
  const attachments = (
    message as AppendMessage & {
      attachments?: Array<{ id: string; name: string; file?: File }>;
    }
  ).attachments ?? [];
  return toAssistantAttachments(attachments, persisted);
}
