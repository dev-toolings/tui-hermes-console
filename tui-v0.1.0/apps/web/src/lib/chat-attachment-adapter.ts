import type { AttachmentAdapter } from "@assistant-ui/react";

export const chatAttachmentAdapter = {
  accept: "*",
  async add({ file }) {
    return {
      id: crypto.randomUUID(),
      type: "file",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(attachment) {
    return {
      ...attachment,
      status: { type: "complete" },
      content: [],
    };
  },
  async remove() {
    // Le fichier reste local au navigateur jusqu'à l'envoi multipart.
  },
} satisfies AttachmentAdapter;
