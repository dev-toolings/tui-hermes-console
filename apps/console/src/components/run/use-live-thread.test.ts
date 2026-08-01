import { expect, mock, test } from "bun:test";
import {
  createThreadPollingCycle,
  createThreadPollingGate,
  pollThreadSnapshot,
  ThreadAccessError,
} from "./use-live-thread";
import type { ThreadSnapshot } from "@console/core/modules/runs/types";
import type { ConnectorType } from "@console/core/types/domain";

const emptySnapshotResult = {
  thread: {} as ThreadSnapshot,
  gaps: [] as ConnectorType[],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("404 access denial is terminal for the refused thread", async () => {
  const fetcher = mock(async () => {
    throw new ThreadAccessError(404, "Conversation introuvable.");
  });

  await expect(
    pollThreadSnapshot("thr_revoked", createThreadPollingGate("thr_revoked"), fetcher),
  ).rejects.toBeInstanceOf(ThreadAccessError);

  const deniedGate = createThreadPollingGate("thr_revoked", true);
  expect(await pollThreadSnapshot("thr_revoked", deniedGate, fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("403 access denial is terminal and no further poll is sent", async () => {
  const fetcher = mock(async () => {
    throw new ThreadAccessError(403, "Accès refusé.");
  });

  await expect(
    pollThreadSnapshot("thr_forbidden", createThreadPollingGate("thr_forbidden"), fetcher),
  ).rejects.toBeInstanceOf(ThreadAccessError);

  expect(
    await pollThreadSnapshot(
      "thr_forbidden",
      createThreadPollingGate("thr_forbidden", true),
      fetcher,
    ),
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("a different thread gets a fresh polling gate after a refusal", async () => {
  const deniedFetcher = mock(async () => {
    throw new ThreadAccessError(404, "Conversation introuvable.");
  });
  await expect(
    pollThreadSnapshot(
      "thr_refused",
      createThreadPollingGate("thr_refused"),
      deniedFetcher,
    ),
  ).rejects.toBeInstanceOf(ThreadAccessError);

  const fetcher = mock(async () => emptySnapshotResult);
  const result = await pollThreadSnapshot(
    "thr_authorized",
    createThreadPollingGate("thr_authorized"),
    fetcher,
  );
  expect(result).toBe(emptySnapshotResult);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("a response for an old thread is ignored by the thread-id guard", async () => {
  const fetcher = mock(async () => emptySnapshotResult);
  const oldGate = createThreadPollingGate("thr_old");

  // The component's current effect passes the current thread id alongside the
  // gate captured by that effect. A late response from the old effect must not
  // be accepted after navigation to a new thread.
  const stale = await pollThreadSnapshot("thr_new", oldGate, fetcher);
  expect(stale).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test("a revoked thread never polls again", async () => {
  const fetcher = mock(async () => emptySnapshotResult);
  const deniedGate = createThreadPollingGate("thr_revoked", true);

  expect(await pollThreadSnapshot("thr_revoked", deniedGate, fetcher)).toBeNull();
  expect(await pollThreadSnapshot("thr_revoked", deniedGate, fetcher)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test("an in-flight 403 revokes the polling cycle before the next poll", async () => {
  const pending = deferred<typeof emptySnapshotResult>();
  const fetcher = mock(() => pending.promise);
  const cycle = createThreadPollingCycle("thr_revoked");
  const firstPoll = cycle.poll(fetcher);

  expect(fetcher).toHaveBeenCalledTimes(1);
  pending.reject(new ThreadAccessError(403, "Accès refusé."));
  await expect(firstPoll).rejects.toBeInstanceOf(ThreadAccessError);

  expect(await cycle.poll(fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("a late response from an invalidated thread is ignored", async () => {
  const pending = deferred<typeof emptySnapshotResult>();
  const fetcher = mock(() => pending.promise);
  const oldCycle = createThreadPollingCycle("thr_old");
  const oldPoll = oldCycle.poll(fetcher);

  expect(fetcher).toHaveBeenCalledTimes(1);
  oldCycle.invalidate();
  pending.resolve(emptySnapshotResult);

  expect(await oldPoll).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
