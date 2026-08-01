import { describe, expect, test } from "bun:test";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createByteLimit } from "./byte-limit";

function sink() {
  return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
}

describe("createByteLimit", () => {
  test("allows exactly the announced size", async () => {
    await expect(
      pipeline(Readable.from([Buffer.alloc(4)]), createByteLimit(4), sink()),
    ).resolves.toBeUndefined();
  });

  test("aborts before forwarding bytes beyond the announced size", async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(3), Buffer.alloc(2)]),
        createByteLimit(4),
        sink(),
      ),
    ).rejects.toThrow("supérieure à 4 octets");
  });
});
