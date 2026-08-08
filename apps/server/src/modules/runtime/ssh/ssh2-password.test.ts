import { describe, expect, mock, test } from "bun:test";
import type { SFTPWrapper, Stats } from "ssh2";
import {
} from "./ssh2-password";

function stats(directory: boolean) {
  return {
    isDirectory: () => directory,
  } as Stats;
}

function handle(options: { mkdirError?: Error; directory?: boolean }) {
  const stat = mock(
    (_path: string, callback: (error: Error | undefined, value: Stats) => void) =>
      callback(undefined, stats(options.directory ?? false)),
  );
  return {
    mkdir: (
      _path: string,
      callback: (error: Error | undefined) => void,
    ) => callback(options.mkdirError),
    stat,
  } as unknown as Pick<SFTPWrapper, "mkdir" | "stat">;
}


