// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  CONSOLE_STATE_VERSION,
  canAccessChannel,
  createInitialState,
  deleteChannelMessage,
  editChannelMessage,
  migrateConsoleState,
  sendChannelMessage,
  setMessagePinned,
  toggleMessageReaction,
  type ChannelMessage,
} from "./console-store";

const createdAt = "2026-08-10T12:00:00.000Z";

function v3Fixture() {
  const state = createInitialState();
  const workspace = state.workspaces[0];
  const data = state.workspaceData[workspace.id];
  return {
    ...state,
    version: 3,
    workspaceData: {
      ...state.workspaceData,
      [workspace.id]: {
        ...data,
        channels: data.channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          kind: channel.kind,
          createdAt: "initial",
        })),
        messages: {
          ...data.messages,
          general: [
            {
              id: "root",
              channelId: "general",
              author: "hermes",
              body: "Message conservé",
              createdAt: "à l'instant",
              attachments: [
                {
                  id: "attachment-1",
                  name: "brief.pdf",
                  type: "application/pdf",
                  size: 32,
                  lastModified: 1,
                },
              ],
            },
            {
              id: "orphan",
              channelId: "general",
              author: "obiwan",
              body: "Réponse orpheline",
              createdAt: "hier",
              parentMessageId: "missing-parent",
            },
          ],
        },
      },
    },
  };
}

describe("console store v4 migration", () => {
  test("preserves valid v3 workspaces, messages, attachments and ordering", () => {
    const legacy = v3Fixture();
    const migrated = migrateConsoleState(legacy);

    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(CONSOLE_STATE_VERSION);
    const messages = migrated?.workspaceData[legacy.workspaces[0].id].messages.general ?? [];
    expect(messages.map((message) => message.id)).toEqual(["root", "orphan"]);
    expect(messages[0].attachments?.[0].name).toBe("brief.pdf");
    expect(messages[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(messages[1].parentMessageId).toBeUndefined();
    expect(migrated?.workspaces).toEqual(legacy.workspaces);
    expect(migrated?.archivedWorkspaces).toEqual(legacy.archivedWorkspaces);
  });

  test("upgrades v2 and v1 without resetting their workspace data", () => {
    const v2 = { ...v3Fixture(), version: 2 };
    const v2Migrated = migrateConsoleState(v2);
    expect(v2Migrated?.workspaceData[v2.workspaces[0].id].messages.general[0].body).toBe(
      "Message conservé",
    );

    const v4 = createInitialState();
    const v1 = {
      ...v4,
      version: 1,
      workspaceData: Object.fromEntries(
        Object.entries(v4.workspaceData).map(([id, data]) => {
          const { channels: _channels, messages: _messages, ...legacyData } = data;
          return [id, legacyData];
        }),
      ),
    };
    const v1Migrated = migrateConsoleState(v1);
    expect(v1Migrated?.workspaceData[v1.workspaces[0].id].items).toEqual(
      v1.workspaceData[v1.workspaces[0].id].items,
    );
    expect(v1Migrated?.workspaceData[v1.workspaces[0].id].channels).toHaveLength(3);
  });

  test("keeps v2 message and attachment metadata beyond new-input limits", () => {
    const v2 = { ...v3Fixture(), version: 2 };
    const workspaceId = v2.workspaces[0].id;
    const longBody = "x".repeat(10_001);
    const longParentId = `parent-${"p".repeat(250)}`;
    const longReplyId = `reply-${"r".repeat(250)}`;
    const attachments = Array.from({ length: 9 }, (_, index) => ({
      id: `legacy-${index}`,
      name: `${"archive-".repeat(30)}${index}.zip`,
      type: "application/zip",
      size: 26 * 1024 * 1024,
      lastModified: index + 1,
    }));
    v2.workspaceData[workspaceId].messages.general = [
      {
        id: longParentId,
        channelId: "general",
        author: "hermes",
        body: longBody,
        createdAt: "à l'instant",
        attachments,
      },
      {
        id: longReplyId,
        channelId: "general",
        author: "obiwan",
        body: "Réponse liée au parent long",
        createdAt: "hier",
        parentMessageId: longParentId,
      },
    ];

    const migrated = migrateConsoleState(v2);
    const message = migrated?.workspaceData[workspaceId].messages.general[0];

    expect(message?.body).toBe(longBody);
    expect(message?.attachments).toEqual(attachments);
    expect(message?.legacyPayload).toBe(true);
    expect(message?.id).toBe(longParentId);
    expect(
      migrated?.workspaceData[workspaceId].messages.general[1],
    ).toMatchObject({ id: longReplyId, parentMessageId: longParentId });
    expect(migrateConsoleState(migrated)?.workspaceData[workspaceId].messages.general[0]).toEqual(
      message,
    );
  });
});

describe("Slack channel helpers", () => {
  test("hides a private channel from non-members in the local prototype", () => {
    const state = createInitialState();
    const channel = {
      ...state.workspaceData[state.workspaces[0].id].channels[0],
      isPrivate: true,
      memberNames: ["Kev Tourteau"],
    };

    expect(canAccessChannel(channel, "Kev Tourteau")).toBe(true);
    expect(canAccessChannel(channel, "intrus")).toBe(false);
    expect(canAccessChannel({ ...channel, isPrivate: false }, "intrus")).toBe(true);
  });

  test("adds thread replies and preserves root-message ordering", () => {
    const state = createInitialState();
    const workspaceId = state.workspaces[0].id;
    const data = {
      ...state.workspaceData[workspaceId],
      messages: {
        ...state.workspaceData[workspaceId].messages,
        general: [
          {
            id: "root",
            channelId: "general",
            author: "hermes",
            body: "Parent",
            createdAt,
            reactions: [],
          } satisfies ChannelMessage,
        ],
      },
    };

    const next = sendChannelMessage(data, {
      id: "reply",
      channelId: "general",
      author: "Kev Tourteau",
      body: "Réponse",
      createdAt,
      parentMessageId: "root",
      broadcastToChannel: true,
    });

    expect(next?.messages.general.map((message) => message.id)).toEqual(["root", "reply"]);
    expect(next?.messages.general[1]).toMatchObject({
      parentMessageId: "root",
      broadcastToChannel: true,
    });
    expect(data.messages.general).toHaveLength(1);
  });

  test("toggles a reaction without duplicate members", () => {
    const state = createInitialState();
    const data = state.workspaceData[state.workspaces[0].id];
    const first = toggleMessageReaction(data, "general", data.messages.general[0].id, "👍", "Kev Tourteau");
    const duplicate = toggleMessageReaction(first!, "general", data.messages.general[0].id, "👍", "Kev Tourteau");
    const third = toggleMessageReaction(duplicate!, "general", data.messages.general[0].id, "👍", "obiwan");

    expect(first?.messages.general[0].reactions).toEqual([{ emoji: "👍", reactors: ["Kev Tourteau"] }]);
    expect(duplicate?.messages.general[0].reactions).toEqual([]);
    expect(third?.messages.general[0].reactions).toEqual([{ emoji: "👍", reactors: ["obiwan"] }]);
  });

  test("pins, edits and deletes only messages owned by the requesting author", () => {
    const state = createInitialState();
    const data = state.workspaceData[state.workspaces[0].id];
    const id = data.messages.general[0].id;
    const pinned = setMessagePinned(data, "general", id, true);
    const rejectedEdit = editChannelMessage(pinned!, "general", id, "Kev Tourteau", "Non autorisé", createdAt);
    const edited = editChannelMessage(pinned!, "general", id, "hermes", "Édité", createdAt);
    const rejectedDelete = deleteChannelMessage(edited!, "general", id, "Kev Tourteau");
    const deleted = deleteChannelMessage(edited!, "general", id, "hermes");

    expect(pinned?.channels.find((channel) => channel.id === "general")?.pinnedMessageIds).toContain(id);
    expect(rejectedEdit).toBeNull();
    expect(edited?.messages.general[0]).toMatchObject({ body: "Édité", editedAt: createdAt });
    expect(rejectedDelete).toBeNull();
    expect(deleted?.messages.general).toHaveLength(0);
  });

  test("does not mutate data from another workspace", () => {
    const state = createInitialState();
    const [first, second] = state.workspaces;
    const updatedFirst = sendChannelMessage(state.workspaceData[first.id], {
      id: "isolated",
      channelId: "general",
      author: "Kev Tourteau",
      body: "Visible ici seulement",
      createdAt,
    });
    const nextState = {
      ...state,
      workspaceData: { ...state.workspaceData, [first.id]: updatedFirst! },
    };

    expect(nextState.workspaceData[second.id]).toBe(state.workspaceData[second.id]);
    expect(nextState.workspaceData[second.id].messages.general).toEqual(
      state.workspaceData[second.id].messages.general,
    );
    expect(nextState.workspaceData[first.id].messages.general.at(-1)?.id).toBe("isolated");
  });
});
