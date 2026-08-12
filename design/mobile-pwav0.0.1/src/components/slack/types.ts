export type SlackChannelTab = "messages" | "files" | "pins";

export type SlackAttachment = {
  id: string;
  name: string;
  type?: string;
  size?: number;
  lastModified?: number;
};

export type SlackReaction = {
  emoji: string;
  reactors: string[];
};

export type SlackChannel = {
  id: string;
  name: string;
  topic?: string;
  description?: string;
  starred?: boolean;
  isPrivate?: boolean;
  memberNames?: string[];
  pinnedMessageIds?: string[];
};

export type SlackChannelMessage = {
  id: string;
  channelId: string;
  author: string;
  body: string;
  createdAt: string;
  attachments?: SlackAttachment[];
  parentMessageId?: string;
  reactions?: SlackReaction[];
  editedAt?: string;
};

export type SlackDraft = {
  body: string;
  attachments: File[];
};

export type SlackComposerProps = {
  channelName: string;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  onSend: (draft: SlackDraft) => void | Promise<void>;
  onFormat?: (format: "bold" | "italic" | "code" | "link") => void;
  onOpenEmoji?: () => void;
  onAttach?: (files: File[]) => void;
  className?: string;
};
