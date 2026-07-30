import { describe, expect, test } from "bun:test";
import { mapForwardError, mapSshError, mapSystemSshStderr } from "./errors";
import { isConnectableAlias, parseSshConfig } from "./ssh-config";
import { baseSshArgs, controlPath, forwardArgs } from "./system-ssh";
import { targetFingerprint } from "./index";
import type { SshTarget } from "./types";

const target: SshTarget = {
  host: "192.168.1.57",
  port: 22,
  user: "kev",
  auth: "agent",
};

describe("targetFingerprint", () => {
  test("identical targets share a channel", () => {
    expect(targetFingerprint(target)).toBe(targetFingerprint({ ...target }));
  });

  test("any changed field opens a new channel", () => {
    const base = targetFingerprint(target);
    expect(targetFingerprint({ ...target, user: "root" })).not.toBe(base);
    expect(targetFingerprint({ ...target, host: "10.0.0.1" })).not.toBe(base);
    expect(targetFingerprint({ ...target, port: 2222 })).not.toBe(base);
    expect(targetFingerprint({ ...target, auth: "password", password: "x" })).not.toBe(base);
  });

  test("never leaks the password", () => {
    const fingerprint = targetFingerprint({ ...target, auth: "password", password: "hunter2" });
    expect(fingerprint).not.toContain("hunter2");
  });
});

describe("system ssh arguments", () => {
  const args = forwardArgs(target, 51234, "127.0.0.1:8642");

  test("never prompts — the Next server has no TTY", () => {
    expect(args).toContain("BatchMode=yes");
  });

  test("fails fast instead of silently serving a dead tunnel", () => {
    expect(args).toContain("ExitOnForwardFailure=yes");
  });

  test("bounds the connect attempt so ssh reports the cause before our own deadline", () => {
    expect(args).toContain("ConnectTimeout=10");
  });

  test("multiplexes over one connection", () => {
    expect(args).toContain("ControlMaster=auto");
    expect(args.some((arg) => arg.startsWith("ControlPath="))).toBe(true);
  });

  test("binds the forward to loopback only", () => {
    expect(args).toContain("127.0.0.1:51234:127.0.0.1:8642");
    expect(args.at(-1)).toBe("kev@192.168.1.57");
  });

  test("control socket stays short enough for a unix socket path", () => {
    expect(controlPath(target).length).toBeLessThan(104);
  });

  test("port is passed with -p", () => {
    expect(baseSshArgs({ ...target, port: 2222 })).toContain("2222");
  });
});

describe("parseSshConfig", () => {
  test("reads aliases, hostname, user and port", () => {
    const { hosts } = parseSshConfig(`
Host dev-pc
    HostName 192.168.1.57
    User kev
    Port 2222
`);
    expect(hosts).toEqual([{ alias: "dev-pc", hostname: "192.168.1.57", user: "kev", port: 2222 }]);
  });

  test("one block can declare several aliases", () => {
    const { hosts } = parseSshConfig("Host a b\n  HostName 10.0.0.1\n");
    expect(hosts.map((host) => host.alias)).toEqual(["a", "b"]);
    expect(hosts.every((host) => host.hostname === "10.0.0.1")).toBe(true);
  });

  test("collects Include directives", () => {
    const { includes } = parseSshConfig("Include ~/.orbstack/ssh/config\nHost x\n");
    expect(includes).toEqual(["~/.orbstack/ssh/config"]);
  });

  test("accepts the Key=value form and ignores comments", () => {
    const { hosts } = parseSshConfig("# comment\nHost x\n  HostName=1.2.3.4\n");
    expect(hosts[0]?.hostname).toBe("1.2.3.4");
  });

  test("wildcard patterns are not connectable targets", () => {
    expect(isConnectableAlias("*")).toBe(false);
    expect(isConnectableAlias("192.168.1.57")).toBe(true);
    const { hosts } = parseSshConfig("Host *\n  User kev\n");
    expect(hosts).toEqual([]);
  });

  test("a directive before any Host block is ignored, not crashed on", () => {
    expect(() => parseSshConfig("  User kev\n")).not.toThrow();
  });
});

describe("mapSystemSshStderr", () => {
  test("no usable key is not the same as an unreachable host", () => {
    const mapped = mapSystemSshStderr("kev@host: Permission denied (publickey).", "127.0.0.1:8642");
    expect(mapped.code).toBe("SSH_AGENT_NO_KEY");
    expect(mapped.status).toBe(401);
  });

  test("forwarding refused by policy", () => {
    const mapped = mapSystemSshStderr(
      "channel 2: open failed: administratively prohibited: open failed",
      "127.0.0.1:8642",
    );
    expect(mapped.code).toBe("SSH_FORWARDING_DISABLED");
    expect(mapped.message).toContain("AllowTcpForwarding");
  });

  test("nothing listening on the remote port", () => {
    const mapped = mapSystemSshStderr(
      "channel 2: open failed: connect failed: Connection refused",
      "127.0.0.1:8642",
    );
    expect(mapped.code).toBe("SSH_FORWARD_FAILED");
    expect(mapped.message).toContain("127.0.0.1:8642");
  });

  test("unreachable host", () => {
    for (const text of [
      "ssh: Could not resolve hostname nope: nodename nor servname provided",
      "ssh: connect to host 10.0.0.1 port 22: Operation timed out",
      "ssh: connect to host 10.0.0.1 port 22: Connection refused",
      "ssh: connect to host 192.168.1.99 port 22: Host is down",
    ]) {
      expect(mapSystemSshStderr(text, "").code).toBe("SSH_UNREACHABLE");
    }
  });

  test("unknown or changed host key", () => {
    expect(mapSystemSshStderr("Host key verification failed.", "").code).toBe(
      "SSH_HOST_KEY_UNKNOWN",
    );
  });

  test("local port already taken", () => {
    expect(mapSystemSshStderr("bind: Address already in use", "").code).toBe("SSH_LOCAL_PORT_BUSY");
  });

  test("anything else falls back without losing the cause", () => {
    const mapped = mapSystemSshStderr("something odd happened", "");
    expect(mapped.code).toBe("SSH_TUNNEL_FAILED");
    expect(mapped.message).toContain("something odd happened");
  });
});

describe("mapSshError (ssh2 password path)", () => {
  test("bad credentials", () => {
    const error = Object.assign(new Error("All configured authentication methods failed"), {
      level: "client-authentication",
    });
    expect(mapSshError(error).code).toBe("SSH_AUTH_FAILED");
    expect(mapSshError(error).status).toBe(401);
  });

  test("host unreachable", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"]) {
      expect(mapSshError(Object.assign(new Error("connect failed"), { code })).code).toBe(
        "SSH_UNREACHABLE",
      );
    }
  });

  test("handshake timeout", () => {
    expect(mapSshError(new Error("Timed out while waiting for handshake")).code).toBe(
      "SSH_UNREACHABLE",
    );
  });

  test("an already-mapped error passes through", () => {
    const first = mapSshError(new Error("boom"));
    expect(mapSshError(first)).toBe(first);
  });

  test("channel reason 1 = forwarding disabled, 2 = dead port", () => {
    expect(mapForwardError(Object.assign(new Error("x"), { reason: 1 }), "h:1").code).toBe(
      "SSH_FORWARDING_DISABLED",
    );
    expect(mapForwardError(Object.assign(new Error("x"), { reason: 2 }), "h:1").code).toBe(
      "SSH_FORWARD_FAILED",
    );
  });
});
