import { useEffect, useId, useState, type ReactNode } from "react";
import { ContextMenu } from "radix-ui";
import { missionsForChannel } from "../../state/channel-attention";
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiEditLine,
  RiFolderTransferLine,
  RiHashtag,
} from "@remixicon/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Modal, ModalButton } from "../ui/modal";
import { useLongPress } from "../mobile/use-long-press";
import { useMediaQuery } from "../mobile/use-media-query";
import type { Channel, ChannelCategory } from "../../state/console-store";
import { RiMore2Fill } from "@remixicon/react";

/**
 * Row actions for a channel or a section.
 *
 * Three triggers, one list of items: right-click on pointer devices, the kebab
 * everywhere, and long-press on touch. The list is declared once and rendered
 * into both Radix roots — a context menu and a dropdown menu are separate trees
 * with no shared item type, so anything less than this drifts the moment an
 * action is added.
 */
export type RowMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type RowMenuItems = Array<RowMenuItem | "separator">;

/* The item classes are copied from ui/dropdown-menu.tsx so the rows read the
   same in both roots. The containers are not identical: only the dropdown
   animates, and its min-width comes from that file. */
const MENU_CONTENT_CLASS =
  "z-[210] min-w-[11rem] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--foreground)] shadow-[var(--shadow-dropdown)]";
const MENU_ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--accent)] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--muted-foreground)]";
const DANGER_ITEM_CLASS =
  "text-[var(--state-neg-fg)] [&_svg]:text-[var(--state-neg-fg)]";

/* Declared at module scope on purpose: building these inline would give the
   items a new component identity on every parent render, so React would remount
   them and an open menu would lose its keyboard highlight on the next render of
   the row. Nothing re-renders these rows on a timer today, but a parent state
   change is enough. */
function ContextMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenu.Item>) {
  return (
    <ContextMenu.Item
      className={`${MENU_ITEM_CLASS} ${className ?? ""}`}
      {...props}
    />
  );
}

function ContextMenuSeparator() {
  return <ContextMenu.Separator className="-mx-1 my-1 h-px bg-[var(--border)]" />;
}

export function RowMenu({
  label,
  items,
  children,
  className = "",
}: {
  /** Names the row in the kebab's accessible label. */
  label: string;
  items: RowMenuItems;
  children: ReactNode;
  /**
   * Callers own the cross-axis alignment. The wrapper deliberately sets none:
   * the mobile row stretches its children so its divider spans the full height,
   * and an `items-center` here would race that rule on stylesheet order rather
   * than on specificity.
   */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /* Radix runs its own long-press timer for the context menu, so on touch the
     two would stack. Touch gets the dropdown, pointers get the context menu. */
  const coarse = useMediaQuery("(pointer: coarse)");
  /* `allowOnButtons` is mandatory here: a channel row is filled edge to edge by
     its own button, and the default guard — which matches the pressed element
     itself — left this gesture unreachable on exactly the surface it exists for. */
  const longPress = useLongPress(coarse ? () => setOpen(true) : undefined, {
    allowOnButtons: true,
  });

  const render = (
    Item: typeof DropdownMenuItem,
    Separator: typeof DropdownMenuSeparator,
  ) =>
    items.map((item, index) =>
      item === "separator" ? (
        <Separator key={`separator-${index}`} />
      ) : (
        <Item
          key={item.id}
          disabled={item.disabled}
          className={item.danger ? DANGER_ITEM_CLASS : undefined}
          onSelect={item.onSelect}
        >
          {item.icon}
          {item.label}
        </Item>
      ),
    );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild disabled={coarse}>
        <div className={`group/row relative flex min-w-0 ${className}`} {...longPress}>
          {children}
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions pour ${label}`}
                onClick={(event) => event.stopPropagation()}
                /* Permanently rendered, not hover-revealed: a hidden affordance
                   is undiscoverable, unreachable on touch, and its appearance
                   shifts the row it belongs to. */
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] data-[state=open]:bg-[var(--surface-hover)] data-[state=open]:text-[var(--foreground)]"
              >
                <RiMore2Fill className="size-4" />
              </button>
            </DropdownMenuTrigger>
            {/* Defensive, not load-bearing: these triggers sit inside rows that
                are themselves links or buttons, and a portalled menu still
                bubbles through the React tree towards them. */}
            <DropdownMenuContent
              align="end"
              onClick={(event) => event.stopPropagation()}
            >
              {render(DropdownMenuItem, DropdownMenuSeparator)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={MENU_CONTENT_CLASS}>
          {render(ContextMenuItem, ContextMenuSeparator)}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * Everything a surface needs to mutate the channel tree. Threaded as one object
 * so the sidebar and the mobile index cannot end up offering different actions.
 */
export type ChannelActions = {
  createChannel: (name: string, categoryId?: string) => { id: string } | null;
  renameChannel: (channelId: string, name: string) => boolean;
  deleteChannel: (channelId: string) => void;
  moveChannelToCategory: (channelId: string, categoryId: string) => void;
  createCategory: (name: string) => boolean;
  renameCategory: (categoryId: string, name: string) => boolean;
  deleteCategory: (categoryId: string) => void;
  moveCategory: (categoryId: string, offset: -1 | 1) => void;
};

/** The one list of channel row actions, shared by every surface and trigger. */
export function channelMenuItems({
  onRename,
  onMove,
  onDelete,
}: {
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}): RowMenuItems {
  return [
    {
      id: "rename",
      label: "Renommer",
      icon: <RiEditLine />,
      onSelect: onRename,
    },
    {
      id: "move",
      label: "Déplacer vers…",
      icon: <RiFolderTransferLine />,
      onSelect: onMove,
    },
    "separator",
    {
      id: "delete",
      label: "Supprimer",
      icon: <RiDeleteBinLine />,
      danger: true,
      onSelect: onDelete,
    },
  ];
}

/**
 * The one list of section header actions. Declared here for the same reason as
 * the row items: written out per surface, the two copies had already drifted
 * apart on their icons before this was extracted.
 */
export function sectionMenuItems({
  category,
  index,
  count,
  actions,
  onRename,
  onAddChannel,
}: {
  category: ChannelCategory;
  index: number;
  count: number;
  actions: Pick<ChannelActions, "moveCategory" | "deleteCategory">;
  onRename: () => void;
  onAddChannel: () => void;
}): RowMenuItems {
  return [
    {
      id: "rename",
      label: "Renommer la section",
      icon: <RiEditLine />,
      onSelect: onRename,
    },
    {
      id: "add",
      label: "Nouveau canal ici",
      icon: <RiHashtag />,
      onSelect: onAddChannel,
    },
    "separator",
    {
      id: "up",
      label: "Monter",
      icon: <RiArrowUpLine />,
      disabled: index === 0,
      onSelect: () => actions.moveCategory(category.id, -1),
    },
    {
      id: "down",
      label: "Descendre",
      icon: <RiArrowDownLine />,
      disabled: index === count - 1,
      onSelect: () => actions.moveCategory(category.id, 1),
    },
    "separator",
    {
      id: "delete",
      label: "Supprimer la section",
      icon: <RiDeleteBinLine />,
      danger: true,
      /* The last section standing has nowhere to hand its channels. */
      disabled: count < 2,
      onSelect: () => actions.deleteCategory(category.id),
    },
  ];
}

/**
 * The dialogs behind the row and section menus, mounted once per surface. Kept
 * together so the sidebar and the mobile index share the exact same wording and
 * the same refusal messages.
 */
export function ChannelDialogs({
  actions,
  categories,
  channelMessageCounts,
  renameTarget,
  deleteTarget,
  moveTarget,
  sectionTarget = null,
  createSectionOpen,
  focusAfterDelete,
  onCloseRename,
  onCloseDelete,
  onCloseMove,
  onCloseSection = () => {},
  onCloseCreateSection,
  onRequestCreateSection,
}: {
  actions: ChannelActions;
  categories: ChannelCategory[];
  channelMessageCounts: Record<string, number>;
  renameTarget: Channel | null;
  deleteTarget: Channel | null;
  moveTarget: Channel | null;
  /** Optional: a surface that shows no section never renames one. */
  sectionTarget?: ChannelCategory | null;
  createSectionOpen: boolean;
  /**
   * Where focus lands after a deletion. The row that carried the kebab is gone
   * by then, so the modal's own restore finds a detached node and focus would
   * otherwise fall back to `<body>`.
   */
  focusAfterDelete?: React.RefObject<HTMLElement | null>;
  onCloseRename: () => void;
  onCloseDelete: () => void;
  onCloseMove: () => void;
  onCloseSection?: () => void;
  onCloseCreateSection: () => void;
  onRequestCreateSection: () => void;
}) {
  return (
    <>
      {renameTarget && (
        <NameDialog
          open
          title={`Renommer #${renameTarget.name}`}
          description="L'identifiant technique du canal ne change pas : les messages, les liens et les missions rattachées continuent de résoudre."
          label="Nom du canal"
          initialValue={renameTarget.name}
          submitLabel="Renommer"
          duplicateMessage="Un canal portant ce nom existe déjà."
          onClose={onCloseRename}
          onSubmit={(value) => actions.renameChannel(renameTarget.id, value)}
        />
      )}
      {deleteTarget && (
        <DeleteChannelDialog
          open
          channel={deleteTarget}
          messageCount={channelMessageCounts[deleteTarget.id] ?? 0}
          missionNames={missionsForChannel(deleteTarget.id).map(
            (mission) => mission.name,
          )}
          onClose={onCloseDelete}
          onConfirm={() => {
            actions.deleteChannel(deleteTarget.id);
            onCloseDelete();
            requestAnimationFrame(() => focusAfterDelete?.current?.focus());
          }}
        />
      )}
      {moveTarget && (
        <MoveChannelDialog
          open
          channelName={moveTarget.name}
          categories={categories}
          currentCategoryId={moveTarget.categoryId}
          onClose={onCloseMove}
          onMove={(categoryId) =>
            actions.moveChannelToCategory(moveTarget.id, categoryId)
          }
          onCreateSection={onRequestCreateSection}
        />
      )}
      {sectionTarget && (
        <NameDialog
          open
          title={`Renommer « ${sectionTarget.name} »`}
          label="Nom de la section"
          initialValue={sectionTarget.name}
          submitLabel="Renommer"
          duplicateMessage="Une section portant ce nom existe déjà."
          onClose={onCloseSection}
          onSubmit={(value) => actions.renameCategory(sectionTarget.id, value)}
        />
      )}
      <NameDialog
        open={createSectionOpen}
        title="Nouvelle section"
        description="Une section regroupe des canaux dans la navigation. Elle ne change ni les accès ni les missions."
        label="Nom de la section"
        placeholder="Opérations"
        submitLabel="Créer"
        duplicateMessage="Une section portant ce nom existe déjà."
        onClose={onCloseCreateSection}
        onSubmit={(value) => actions.createCategory(value)}
      />
    </>
  );
}

/** Shared single-field dialog: renaming a channel, a section, or creating one. */
export function NameDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  submitLabel,
  duplicateMessage,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel: string;
  duplicateMessage: string;
  onClose: () => void;
  /** Returns false when the store refused the value, e.g. a taken name. */
  onSubmit: (value: string) => boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const inputId = useId();
  const formId = useId();

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError("");
    }
  }, [initialValue, open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) {
      setError(`${label} : saisissez une valeur.`);
      return;
    }
    if (!onSubmit(value)) {
      setError(duplicateMessage);
      return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <ModalButton onClick={onClose}>Annuler</ModalButton>
          <ModalButton type="submit" variant="primary" form={formId}>
            {submitLabel}
          </ModalButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <label
          htmlFor={inputId}
          className="block text-[12px] font-medium text-[var(--foreground)]"
        >
          {label}
        </label>
        <input
          id={inputId}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder={placeholder}
          className={`mt-1.5 h-11 w-full rounded-[8px] border bg-[var(--card)] px-2.5 text-body-2-regular text-[var(--foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-[color-mix(in_srgb,var(--ring)_55%,var(--border-control))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_14%,transparent)] md:h-8 ${error ? "border-[var(--state-neg-fg)]" : "border-[var(--border-control)]"}`}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="mt-1.5 text-body-2-regular text-[var(--state-neg-fg)]"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Names exactly what a deletion takes with it before it is confirmed. */
export function DeleteChannelDialog({
  open,
  channel,
  messageCount,
  missionNames,
  onClose,
  onConfirm,
}: {
  open: boolean;
  channel: Pick<Channel, "name" | "pinnedMessageIds">;
  messageCount: number;
  missionNames: string[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const pinnedCount = channel.pinnedMessageIds.length;
  const blast = [
    `${messageCount} ${messageCount > 1 ? "messages" : "message"}`,
    `${pinnedCount} ${pinnedCount > 1 ? "épinglés" : "épinglé"}`,
  ].join(" · ");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Supprimer #${channel.name} ?`}
      description="Cette suppression est définitive dans cette maquette locale."
      footer={
        <>
          <ModalButton onClick={onClose}>Annuler</ModalButton>
          <ModalButton variant="danger" onClick={onConfirm}>
            Supprimer
          </ModalButton>
        </>
      }
    >
      <div className="grid gap-2 text-body-2-regular text-[var(--muted-foreground)]">
        <p>
          Part avec le canal : <span className="text-[var(--foreground)]">{blast}</span>.
        </p>
        {missionNames.length > 0 && (
          <p role="alert" className="text-[var(--state-warn-fg)]">
            {missionNames.length > 1
              ? `${missionNames.length} missions y sont rattachées (${missionNames.join(", ")}). Elles restent dans la Console, mais perdent leur lien vers ce canal.`
              : `Une mission y est rattachée (${missionNames[0]}). Elle reste dans la Console, mais perd son lien vers ce canal.`}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Section picker. A modal rather than a submenu: one surface serves the kebab,
 * the context menu and the long-press alike, and it stays reachable by keyboard
 * without duplicating a Radix submenu in two different roots.
 */
export function MoveChannelDialog({
  open,
  channelName,
  categories,
  currentCategoryId,
  onClose,
  onMove,
  onCreateSection,
}: {
  open: boolean;
  channelName: string;
  categories: ChannelCategory[];
  currentCategoryId: string;
  onClose: () => void;
  onMove: (categoryId: string) => void;
  onCreateSection: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Déplacer #${channelName}`}
      description="Choisissez la section qui accueille ce canal."
      footer={<ModalButton onClick={onClose}>Fermer</ModalButton>}
    >
      <div role="group" aria-label="Sections" className="grid gap-1 pb-1">
        {categories.map((category) => {
          const current = category.id === currentCategoryId;
          return (
            <button
              key={category.id}
              type="button"
              aria-current={current ? "true" : undefined}
              disabled={current}
              onClick={() => {
                onMove(category.id);
                onClose();
              }}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-[8px] px-2.5 text-left text-body-2-medium transition-colors md:min-h-9 ${
                current
                  ? "bg-[var(--surface-hover)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="truncate">{category.name}</span>
              {current && (
                <span className="shrink-0 text-caption-1 text-[var(--text-tertiary)]">
                  Section actuelle
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            onClose();
            onCreateSection();
          }}
          className="mt-1 flex min-h-11 items-center rounded-[8px] px-2.5 text-left text-body-2-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:min-h-9"
        >
          Nouvelle section…
        </button>
      </div>
    </Modal>
  );
}
