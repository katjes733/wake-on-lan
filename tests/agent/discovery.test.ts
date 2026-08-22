import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateSocket } = vi.hoisted(() => ({
  mockCreateSocket: vi.fn(),
}));

vi.mock("node:dgram", () => ({
  default: { createSocket: mockCreateSocket },
}));

const { discoverServer } = await import("~/agent/discovery");

function makeFakeSocket() {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    handlers,
    on: (event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    },
    bind: (cb: () => void) => cb(),
    setBroadcast: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  };
}

describe("discoverServer", () => {
  beforeEach(() => {
    mockCreateSocket.mockReset();
  });

  it("resolves with the reply's source address and httpsPort on a valid reply", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    const promise = discoverServer(["AA:BB:CC:DD:EE:FF"], { timeoutMs: 1000 });
    socket.handlers.message(
      Buffer.from(
        JSON.stringify({
          app: "wake-on-lan",
          httpsPort: 3001,
          targetId: "target-1",
        }),
      ),
      { address: "192.168.2.110", port: 41920 },
    );
    const result = await promise;

    expect(result).toEqual({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: "target-1",
    });
  });

  it("resolves with targetId:null when the reply doesn't include one", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    const promise = discoverServer(["AA:BB:CC:DD:EE:FF"], { timeoutMs: 1000 });
    socket.handlers.message(
      Buffer.from(JSON.stringify({ app: "wake-on-lan", httpsPort: 3001 })),
      { address: "192.168.2.110", port: 41920 },
    );
    const result = await promise;

    expect(result).toEqual({
      serverBaseUrl: "https://192.168.2.110:3001",
      targetId: null,
    });
  });

  it("ignores a malformed reply and keeps waiting", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    const promise = discoverServer(["AA:BB:CC:DD:EE:FF"], { timeoutMs: 1000 });
    socket.handlers.message(Buffer.from("not json"), {
      address: "192.168.2.110",
      port: 41920,
    });
    socket.handlers.message(
      Buffer.from(
        JSON.stringify({ app: "wake-on-lan", httpsPort: 3001, targetId: null }),
      ),
      { address: "192.168.2.110", port: 41920 },
    );
    const result = await promise;

    expect(result?.serverBaseUrl).toBe("https://192.168.2.110:3001");
  });

  it("ignores a reply from an unrelated app and keeps waiting for a valid one", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    const promise = discoverServer(["AA:BB:CC:DD:EE:FF"], { timeoutMs: 1000 });
    socket.handlers.message(
      Buffer.from(JSON.stringify({ app: "some-other-app" })),
      { address: "192.168.2.50", port: 12345 },
    );
    socket.handlers.message(
      Buffer.from(
        JSON.stringify({ app: "wake-on-lan", httpsPort: 3001, targetId: null }),
      ),
      { address: "192.168.2.110", port: 41920 },
    );
    const result = await promise;

    expect(result?.serverBaseUrl).toBe("https://192.168.2.110:3001");
  });

  it("resolves null when no reply arrives before the timeout", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    const result = await discoverServer(["AA:BB:CC:DD:EE:FF"], {
      timeoutMs: 20,
    });

    expect(result).toBeNull();
    expect(socket.close).toHaveBeenCalled();
  });

  it("broadcasts the request with the local MAC addresses to the given port", async () => {
    const socket = makeFakeSocket();
    mockCreateSocket.mockReturnValue(socket);

    void discoverServer(["AA:BB:CC:DD:EE:FF"], {
      port: 12345,
      timeoutMs: 1000,
    });
    socket.handlers.message(
      Buffer.from(
        JSON.stringify({ app: "wake-on-lan", httpsPort: 3001, targetId: null }),
      ),
      { address: "192.168.2.110", port: 12345 },
    );

    expect(socket.setBroadcast).toHaveBeenCalledWith(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        app: "wake-on-lan",
        type: "discover",
        macAddresses: ["AA:BB:CC:DD:EE:FF"],
      }),
      12345,
      "255.255.255.255",
    );
  });
});
