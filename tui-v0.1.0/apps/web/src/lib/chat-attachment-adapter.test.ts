import { describe, expect, test } from "bun:test";
import { chatAttachmentAdapter } from "./chat-attachment-adapter";

describe("chatAttachmentAdapter", () => {
  test("conserve le File réel jusqu'à l'envoi multipart", async () => {
    const file = new File(["preuve"], "preuve.txt", { type: "text/plain" });

    const pending = await chatAttachmentAdapter.add({ file });
    expect(pending).toMatchObject({
      type: "file",
      name: "preuve.txt",
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    });

    const complete = await chatAttachmentAdapter.send(pending);
    expect(complete).toMatchObject({
      file,
      status: { type: "complete" },
      content: [],
    });
  });
});
