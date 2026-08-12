// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  MAX_ASSISTANT_ATTACHMENT_BYTES,
  addAcceptedAttachments,
  hydrateAssistantComposerOnce,
  toAssistantAttachments,
} from "./composer-attachments";

describe("assistant composer attachment recovery", () => {
  test("bounds picker and paste additions to eight accepted files", async () => {
    const added: string[] = [];
    const composer = {
      getState: () => ({ attachments: [], attachmentAccept: "*" }),
      addAttachment: async (file: File) => {
        added.push(file.name);
      },
    };
    const files = [
      new File([new Uint8Array(MAX_ASSISTANT_ATTACHMENT_BYTES + 1)], "trop-lourd.bin"),
      ...Array.from({ length: 9 }, (_, index) => new File(["ok"], `preuve-${index}.txt`)),
    ];

    const accepted = await addAcceptedAttachments(composer, files);
    expect(accepted.map((file) => file.name)).toEqual(
      Array.from({ length: 8 }, (_, index) => `preuve-${index}.txt`),
    );
    expect(added).toEqual(accepted.map((file) => file.name));
  });

  test("keeps metadata when an existing runtime attachment has no File", () => {
    expect(
      toAssistantAttachments(
        [{ id: "persisted", name: "brief.pdf" }],
        [{ id: "persisted", name: "brief.pdf", size: 512 }],
      ),
    ).toEqual([{ id: "persisted", name: "brief.pdf", size: 512 }]);
  });

  test("shares draft hydration across a StrictMode effect replay", async () => {
    const hydration = { current: null as Promise<void> | null };
    const drafts: string[] = [];
    const composer = {
      setText: (draft: string) => drafts.push(draft),
    };

    const firstSetup = hydrateAssistantComposerOnce(
      hydration,
      composer,
      "brouillon",
    );
    const replayedSetup = hydrateAssistantComposerOnce(
      hydration,
      composer,
      "brouillon",
    );

    expect(replayedSetup).toBe(firstSetup);
    await expect(Promise.all([firstSetup, replayedSetup])).resolves.toEqual([undefined, undefined]);
    expect(drafts).toEqual(["brouillon"]);
  });

  test("does not recreate a persisted attachment without its local File", async () => {
    const hydration = { current: null as Promise<void> | null };
    const drafts: string[] = [];
    const composer = { setText: (draft: string) => drafts.push(draft) };
    const persisted = [{ id: "lost-file", name: "brief.pdf", size: 512 }];

    await hydrateAssistantComposerOnce(hydration, composer, "brouillon");
    expect(drafts).toEqual(["brouillon"]);
    expect(toAssistantAttachments([], persisted)).toEqual([]);
  });
});
