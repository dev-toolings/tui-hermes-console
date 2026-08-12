// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  CONSOLE_STATE_VERSION,
  DEFAULT_CATEGORY_ID,
  DEFAULT_CATEGORY_NAME,
  canAccessChannel,
  createChannelCategory,
  createInitialState,
  deleteChannel,
  deleteChannelCategory,
  deleteChannelMessage,
  editChannelMessage,
  migrateConsoleState,
  moveChannelCategory,
  moveChannelToCategory,
  renameChannel,
  renameChannelCategory,
  sendChannelMessage,
  setMessagePinned,
  toggleMessageReaction,
  type ChannelMessage,
  type ConsoleState,
  type WorkspaceData,
} from "./console-store";

const createdAt = "2026-08-10T12:00:00.000Z";

/**
 * v4 stored no sections and marked channels with a `kind`. Every workspace of a
 * real payload looked like this, not just the one a test cares about — a fixture
 * that degrades one workspace and leaves its siblings in the current shape
 * describes a state that never existed.
 */
function v4WorkspaceData(data: WorkspaceData) {
  const { channelCategories: _sections, ...rest } = data;
  return {
    ...rest,
    channels: data.channels.map(({ categoryId: _category, ...channel }) => ({
      ...channel,
      kind: "default" as const,
    })),
  };
}

function v4Fixture() {
  const state = createInitialState();
  return {
    ...state,
    version: 4,
    workspaceData: Object.fromEntries(
      Object.entries(state.workspaceData).map(([id, data]) => [
        id,
        v4WorkspaceData(data),
      ]),
    ),
  };
}

/** v3 additionally stored bare channels and free-form dates. */
function v3WorkspaceData(data: WorkspaceData) {
  const { channelCategories: _sections, ...rest } = data;
  return {
    ...rest,
    channels: data.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      kind: "default" as const,
      createdAt: "initial",
    })),
  };
}

function v3Fixture() {
  const state = createInitialState();
  const workspace = state.workspaces[0];
  const workspaceData = Object.fromEntries(
    Object.entries(state.workspaceData).map(([id, data]) => [
      id,
      v3WorkspaceData(data),
    ]),
  );
  return {
    ...state,
    version: 3,
    workspaceData: {
      ...workspaceData,
      [workspace.id]: {
        ...workspaceData[workspace.id],
        messages: {
          ...state.workspaceData[workspace.id].messages,
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

describe("console store v5 migration", () => {
  test("materializes one default section and files every channel in it", () => {
    const legacy = v4Fixture();
    const migrated = migrateConsoleState(legacy);

    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(CONSOLE_STATE_VERSION);
    for (const workspace of legacy.workspaces) {
      const data = migrated?.workspaceData[workspace.id];
      expect(data?.channelCategories).toEqual([
        { id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME },
      ]);
      expect(
        data?.channels.every((channel) => channel.categoryId === DEFAULT_CATEGORY_ID),
      ).toBe(true);
      /* The discriminant is gone, not merely ignored. */
      expect(
        data?.channels.every((channel) => !("kind" in channel)),
      ).toBe(true);
    }
    const first = legacy.workspaces[0].id;
    expect(migrated?.workspaceData[first].messages.general[0].body).toBe(
      legacy.workspaceData[first].messages.general[0].body,
    );
  });

  test("loads a v4 payload whose seeded channel was already gone", () => {
    /* v4 required general/équipe/incidents to exist, so a payload missing one
       was unloadable and silently reset the whole prototype. v5 has no
       structural channel id, and this is the case that proves it. */
    const legacy = v4Fixture();
    const workspaceId = legacy.workspaces[0].id;
    const data = legacy.workspaceData[workspaceId];
    const { incidents: _dropped, ...messages } = data.messages;
    legacy.workspaceData[workspaceId] = {
      ...data,
      channels: data.channels.filter((channel) => channel.id !== "incidents"),
      messages,
    };

    const migrated = migrateConsoleState(legacy);

    expect(migrated).not.toBeNull();
    expect(
      migrated?.workspaceData[workspaceId].channels.map((channel) => channel.id),
    ).toEqual(["general", "équipe"]);
  });

  test("refuses a payload whose channel points at no section", () => {
    const state = createInitialState();
    const workspaceId = state.workspaces[0].id;
    const data = state.workspaceData[workspaceId];
    const dangling: ConsoleState = {
      ...state,
      workspaceData: {
        ...state.workspaceData,
        [workspaceId]: {
          ...data,
          channels: data.channels.map((channel) => ({
            ...channel,
            categoryId: "ghost",
          })),
        },
      },
    };

    expect(migrateConsoleState(dangling)).toBeNull();
    expect(
      migrateConsoleState({ ...state, workspaceData: { ...state.workspaceData, [workspaceId]: { ...data, channelCategories: [] } } }),
    ).toBeNull();
  });

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

describe("channel rename and deletion", () => {
  const workspaceOf = (data: WorkspaceData) => {
    const state = createInitialState();
    return {
      ...state,
      workspaceData: { ...state.workspaceData, [state.workspaces[0].id]: data },
    };
  };
  const seed = () => {
    const state = createInitialState();
    return state.workspaceData[state.workspaces[0].id];
  };

  test("renames the label and keeps the id messages are filed under", () => {
    const renamed = renameChannel(seed(), "incidents", "  incidents prod  ");

    expect(renamed?.channels.find((channel) => channel.id === "incidents")?.name).toBe(
      "incidents prod",
    );
    expect(Object.keys(renamed?.messages ?? {})).toContain("incidents");
    expect(migrateConsoleState(workspaceOf(renamed!))).not.toBeNull();
  });

  test("refuses a blank, taken or accent-equivalent label", () => {
    expect(renameChannel(seed(), "incidents", "   ")).toBeNull();
    expect(renameChannel(seed(), "incidents", "général")).toBeNull();
    expect(renameChannel(seed(), "incidents", "GENERAL")).toBeNull();
    expect(renameChannel(seed(), "nowhere", "valide")).toBeNull();
    /* Re-casing a channel's own name is not a collision with itself. */
    expect(renameChannel(seed(), "incidents", "Incidents")).not.toBeNull();
  });

  test("deletes any channel and its messages in the same step", () => {
    const data = seed();
    const deleted = deleteChannel(data, "incidents");

    expect(deleted?.channels.map((channel) => channel.id)).toEqual([
      "general",
      "équipe",
    ]);
    expect(deleted?.messages).not.toHaveProperty("incidents");
    /* The load path replaces a rejected payload with the seed, so "still
       migratable" is the assertion that stands between a delete and a wipe. */
    expect(migrateConsoleState(workspaceOf(deleted!))).not.toBeNull();
    expect(deleteChannel(data, "nowhere")).toBeNull();
    expect(data.channels).toHaveLength(3);
  });

  test("survives deleting every channel of a workspace", () => {
    const emptied = seed().channels.reduce<WorkspaceData | null>(
      (data, channel) => (data ? deleteChannel(data, channel.id) : null),
      seed(),
    );

    expect(emptied?.channels).toEqual([]);
    expect(emptied?.messages).toEqual({});
    expect(migrateConsoleState(workspaceOf(emptied!))).not.toBeNull();
  });
});

describe("channel sections", () => {
  const seed = () => {
    const state = createInitialState();
    return state.workspaceData[state.workspaces[0].id];
  };

  test("creates a section and refuses duplicate ids, names or free-text ids", () => {
    const created = createChannelCategory(seed(), "ops-1", " Opérations ");

    expect(created?.channelCategories).toEqual([
      { id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME },
      { id: "ops-1", name: "Opérations" },
    ]);
    expect(createChannelCategory(created!, "ops-1", "Autre")).toBeNull();
    expect(createChannelCategory(created!, "ops-2", "OPERATIONS")).toBeNull();
    expect(createChannelCategory(seed(), "mes ops", "Opérations")).toBeNull();
    expect(createChannelCategory(seed(), "ops-1", "  ")).toBeNull();
  });

  test("moves a channel between sections and refuses an unknown target", () => {
    const withSection = createChannelCategory(seed(), "ops-1", "Opérations")!;
    const moved = moveChannelToCategory(withSection, "incidents", "ops-1");

    expect(moved?.channels.find((channel) => channel.id === "incidents")?.categoryId).toBe(
      "ops-1",
    );
    expect(moveChannelToCategory(withSection, "incidents", "ghost")).toBeNull();
    expect(moveChannelToCategory(withSection, "nowhere", "ops-1")).toBeNull();
  });

  test("returns orphans to the survivor and protects the last section standing", () => {
    const withSection = createChannelCategory(seed(), "ops-1", "Opérations")!;
    const moved = moveChannelToCategory(withSection, "incidents", "ops-1")!;
    const removed = deleteChannelCategory(moved, "ops-1");

    expect(removed?.channelCategories).toHaveLength(1);
    expect(
      removed?.channels.every((channel) => channel.categoryId === DEFAULT_CATEGORY_ID),
    ).toBe(true);
    expect(removed?.channels).toHaveLength(3);
    /* Not "the default one is special": whichever section is alone is kept. */
    expect(deleteChannelCategory(seed(), DEFAULT_CATEGORY_ID)).toBeNull();
    const onlyCustom = deleteChannelCategory(
      renameChannelCategory(withSection, DEFAULT_CATEGORY_ID, "Général")!,
      DEFAULT_CATEGORY_ID,
    );
    expect(onlyCustom?.channelCategories).toEqual([{ id: "ops-1", name: "Opérations" }]);
    expect(deleteChannelCategory(onlyCustom!, "ops-1")).toBeNull();
  });

  test("renames the default section like any other", () => {
    const renamed = renameChannelCategory(seed(), DEFAULT_CATEGORY_ID, "Coordination");

    expect(renamed?.channelCategories[0]).toEqual({
      id: DEFAULT_CATEGORY_ID,
      name: "Coordination",
    });
    expect(renameChannelCategory(seed(), DEFAULT_CATEGORY_ID, " ")).toBeNull();
    expect(renameChannelCategory(seed(), "ghost", "Coordination")).toBeNull();
    const two = createChannelCategory(seed(), "ops-1", "Opérations")!;
    expect(renameChannelCategory(two, "ops-1", DEFAULT_CATEGORY_NAME)).toBeNull();
  });

  test("reorders sections by one step and stops at both ends", () => {
    const two = createChannelCategory(seed(), "ops-1", "Opérations")!;

    expect(moveChannelCategory(two, "ops-1", -1)?.channelCategories.map((c) => c.id)).toEqual([
      "ops-1",
      DEFAULT_CATEGORY_ID,
    ]);
    expect(moveChannelCategory(two, DEFAULT_CATEGORY_ID, -1)).toBeNull();
    expect(moveChannelCategory(two, "ops-1", 1)).toBeNull();
    expect(moveChannelCategory(two, "ghost", 1)).toBeNull();
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
    });

    expect(next?.messages.general.map((message) => message.id)).toEqual(["root", "reply"]);
    expect(next?.messages.general[1]).toMatchObject({
      parentMessageId: "root",
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
