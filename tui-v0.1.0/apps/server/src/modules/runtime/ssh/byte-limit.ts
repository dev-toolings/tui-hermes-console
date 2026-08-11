import { Transform } from "node:stream";

export function createByteLimit(maxBytes: number) {
  let transferred = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      transferred += chunk.length;
      if (transferred > maxBytes) {
        callback(new Error(`sortie distante supérieure à ${maxBytes} octets`));
        return;
      }
      callback(null, chunk);
    },
  });
}
