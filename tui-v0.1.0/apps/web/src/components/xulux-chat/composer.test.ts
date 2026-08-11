import { describe, expect, test } from "bun:test";
import { openXuluxAttachmentPicker } from "./composer";

type TemporaryInput = {
  type: string;
  multiple: boolean;
  hidden: boolean;
  accept: string;
  files: FileList | null;
  onchange: ((event: Event) => Promise<void>) | null;
  oncancel: (() => void) | null;
  click: () => void;
  remove: () => void;
};

function createTemporaryInput(events: string[]): TemporaryInput {
  return {
    type: "",
    multiple: false,
    hidden: false,
    accept: "",
    files: null,
    onchange: null,
    oncancel: null,
    click: () => events.push("picker"),
    remove: () => events.push("remove"),
  };
}

function withTemporaryInput(
  input: TemporaryInput,
  run: () => Promise<void>,
) {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => input,
      body: { appendChild: () => undefined },
    },
  });

  return run().finally(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });
}

describe("Xulux composer attachment picker", () => {
  test("restores focus before asynchronous attachment completion and removes the temporary input", async () => {
    const events: string[] = [];
    const temporaryInput = createTemporaryInput(events);
    let resolveAttachment!: () => void;
    const attachment = new Promise<void>((resolve) => {
      resolveAttachment = () => {
        events.push("attachment-resolved");
        resolve();
      };
    });
    const composer = {
      getState: () => ({ attachmentAccept: "image/*" }),
      addAttachment: () => {
        events.push("attachment-started");
        return attachment;
      },
    };
    const composerInput = {
      blur: () => events.push("blur"),
      focus: (options: FocusOptions) => events.push(`focus:${String(options.preventScroll)}`),
    };

    await withTemporaryInput(temporaryInput, async () => {
      openXuluxAttachmentPicker(composer, composerInput);
      temporaryInput.files = [{}] as unknown as FileList;

      const selection = temporaryInput.onchange?.({
        target: temporaryInput,
      } as unknown as Event);

      expect(events).toEqual([
        "blur",
        "picker",
        "remove",
        "focus:true",
        "attachment-started",
      ]);
      expect(temporaryInput.accept).toBe("image/*");

      resolveAttachment();
      await selection;

      expect(events).toEqual(expect.arrayContaining([
        "focus:true",
        "attachment-resolved",
      ]));
      expect(events.indexOf("focus:true")).toBeLessThan(events.indexOf("attachment-resolved"));
    });
  });

  test("restores focus and removes the input after picker cancellation", async () => {
    const events: string[] = [];
    const temporaryInput = createTemporaryInput(events);
    const composer = {
      getState: () => ({ attachmentAccept: "*" }),
      addAttachment: async () => undefined,
    };
    const composerInput = {
      blur: () => events.push("blur"),
      focus: (options: FocusOptions) => events.push(`focus:${String(options.preventScroll)}`),
    };

    await withTemporaryInput(temporaryInput, async () => {
      openXuluxAttachmentPicker(composer, composerInput);
      temporaryInput.files = [] as unknown as FileList;
      temporaryInput.oncancel?.();

      expect(events).toEqual(["blur", "picker", "remove", "focus:true"]);
      expect(temporaryInput.accept).toBe("");
    });
  });
});
