import { expect, mock, test } from "bun:test";
import {
  createThreadPollingGate,
  pollThreadSnapshot,
  ThreadAccessError,
} from "./use-live-thread";

test("thread polling becomes terminal after the first access denial", async () => {
  const gate = createThreadPollingGate("thr_revoked");
  const fetcher = mock(async () => {
    throw new ThreadAccessError(404, "Conversation introuvable.");
  });

  await expect(pollThreadSnapshot("thr_revoked", gate, fetcher)).rejects.toBeInstanceOf(
    ThreadAccessError,
  );
  expect(await pollThreadSnapshot("thr_revoked", gate, fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
