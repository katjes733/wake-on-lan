import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const {
  mockListTargets,
  mockGetTargetById,
  mockFindTargetByMacAddress,
  mockCreateTarget,
  mockUpdateTarget,
  mockDeleteTarget,
  mockSendMagicPacket,
  mockArmWakeFlag,
  mockConsumeWakeFlag,
  mockArmShutdownFlag,
  mockConsumeShutdownFlag,
  mockGetAgentConfig,
  mockUpsertAgentConfig,
  mockRecordHeartbeat,
  mockGetAgentStatus,
} = vi.hoisted(() => ({
  mockListTargets: vi.fn(),
  mockGetTargetById: vi.fn(),
  mockFindTargetByMacAddress: vi.fn(),
  mockCreateTarget: vi.fn(),
  mockUpdateTarget: vi.fn(),
  mockDeleteTarget: vi.fn(),
  mockSendMagicPacket: vi.fn(),
  mockArmWakeFlag: vi.fn(),
  mockConsumeWakeFlag: vi.fn(),
  mockArmShutdownFlag: vi.fn(),
  mockConsumeShutdownFlag: vi.fn(),
  mockGetAgentConfig: vi.fn(),
  mockUpsertAgentConfig: vi.fn(),
  mockRecordHeartbeat: vi.fn(),
  mockGetAgentStatus: vi.fn(),
}));

vi.mock("~/server/util/routes/targets", () => ({
  listTargets: mockListTargets,
  getTargetById: mockGetTargetById,
  findTargetByMacAddress: mockFindTargetByMacAddress,
  createTarget: mockCreateTarget,
  updateTarget: mockUpdateTarget,
  deleteTarget: mockDeleteTarget,
}));

vi.mock("~/server/util/wol/sendMagicPacket", () => ({
  sendMagicPacket: mockSendMagicPacket,
}));

vi.mock("~/server/util/wol/wakeFlags", () => ({
  armWakeFlag: mockArmWakeFlag,
  consumeWakeFlag: mockConsumeWakeFlag,
}));

vi.mock("~/server/util/wol/shutdownFlags", () => ({
  armShutdownFlag: mockArmShutdownFlag,
  consumeShutdownFlag: mockConsumeShutdownFlag,
}));

vi.mock("~/server/util/agent/agentConfig", () => ({
  getAgentConfig: mockGetAgentConfig,
  upsertAgentConfig: mockUpsertAgentConfig,
}));

vi.mock("~/server/util/agent/agentStatus", () => ({
  recordHeartbeat: mockRecordHeartbeat,
  getAgentStatus: mockGetAgentStatus,
}));

// Rate limiting talks to a real Redis client — irrelevant at this layer and
// would otherwise require a live Redis for these tests to even run.
vi.mock("~/server/middleware/rateLimiter", () => {
  const passthrough = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => next();
  return {
    wakeLimiter: passthrough,
    consumeLimiter: passthrough,
    shutdownLimiter: passthrough,
    shutdownConsumeLimiter: passthrough,
    statusLimiter: passthrough,
  };
});

const { router } = await import("~/server/routes/targets");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/targets", router);
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: "Something went wrong" });
    },
  );
  return app;
}

const baseTarget = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "HTPC",
  mac_address: "AA:BB:CC:DD:EE:FF",
  broadcast_address: "192.168.1.255",
  static_ip: null,
  notes: null,
  creation_time: new Date("2026-01-01T00:00:00Z"),
  modified_time: new Date("2026-01-01T00:00:00Z"),
};

const emptyAgentStatus = { lastSeenAt: null, agentVersion: null };

const baseAgentConfig = {
  wolAware: false,
  defaultScript: null,
  wolScript: null,
  shutdownEnabled: false,
  pollIntervalSeconds: null,
  lokiPushUrl: null,
};

describe("targets router", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentStatus.mockResolvedValue(emptyAgentStatus);
    mockGetAgentConfig.mockResolvedValue(baseAgentConfig);
    app = buildApp();
  });

  describe("GET /", () => {
    it("returns all targets mapped to the API (camelCase) shape, including agent status/config", async () => {
      mockListTargets.mockResolvedValue([baseTarget]);
      const res = await request(app).get("/api/v1/targets");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: baseTarget.id,
          name: "HTPC",
          macAddress: "AA:BB:CC:DD:EE:FF",
          broadcastAddress: "192.168.1.255",
          staticIp: null,
          notes: null,
          createdAt: baseTarget.creation_time.toISOString(),
          updatedAt: baseTarget.modified_time.toISOString(),
          lastSeenAt: null,
          online: false,
          agentVersion: null,
          agentConfig: baseAgentConfig,
        },
      ]);
    });

    it("reports online:true when the last heartbeat is within the staleness threshold", async () => {
      mockListTargets.mockResolvedValue([baseTarget]);
      mockGetAgentStatus.mockResolvedValue({
        lastSeenAt: new Date(),
        agentVersion: "1.0.0",
      });
      const res = await request(app).get("/api/v1/targets");
      expect(res.body[0].online).toBe(true);
      expect(res.body[0].agentVersion).toBe("1.0.0");
    });

    it("reports online:false when the last heartbeat is older than the staleness threshold", async () => {
      mockListTargets.mockResolvedValue([baseTarget]);
      mockGetAgentStatus.mockResolvedValue({
        lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
        agentVersion: "1.0.0",
      });
      const res = await request(app).get("/api/v1/targets");
      expect(res.body[0].online).toBe(false);
    });
  });

  describe("GET /:id", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app).get(`/api/v1/targets/${baseTarget.id}`);
      expect(res.status).toBe(404);
    });

    it("returns the target when found", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const res = await request(app).get(`/api/v1/targets/${baseTarget.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("HTPC");
      expect(res.body.agentConfig).toEqual(baseAgentConfig);
    });
  });

  describe("POST /", () => {
    it("rejects invalid input with 400 and per-field details", async () => {
      const res = await request(app)
        .post("/api/v1/targets")
        .send({ name: "", macAddress: "not-a-mac" });
      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "name" })]),
      );
    });

    it("returns 409 when the MAC address is already registered", async () => {
      mockFindTargetByMacAddress.mockResolvedValue(baseTarget);
      const res = await request(app)
        .post("/api/v1/targets")
        .send({ name: "Dup", macAddress: "AA:BB:CC:DD:EE:FF" });
      expect(res.status).toBe(409);
      expect(mockCreateTarget).not.toHaveBeenCalled();
    });

    it("creates a target on valid, unique input", async () => {
      mockFindTargetByMacAddress.mockResolvedValue(null);
      mockCreateTarget.mockResolvedValue(baseTarget);
      const res = await request(app)
        .post("/api/v1/targets")
        .send({ name: "HTPC", macAddress: "AA:BB:CC:DD:EE:FF" });
      expect(res.status).toBe(201);
      expect(mockCreateTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "HTPC",
          mac_address: "AA:BB:CC:DD:EE:FF",
        }),
      );
    });
  });

  describe("POST /resolve", () => {
    it("rejects an empty macAddresses array with 400", async () => {
      const res = await request(app)
        .post("/api/v1/targets/resolve")
        .send({ macAddresses: [] });
      expect(res.status).toBe(400);
    });

    it("returns 404 when no MAC address matches any target", async () => {
      mockFindTargetByMacAddress.mockResolvedValue(null);
      const res = await request(app)
        .post("/api/v1/targets/resolve")
        .send({ macAddresses: ["AA:BB:CC:DD:EE:FF"] });
      expect(res.status).toBe(404);
    });

    it("resolves to the matching target's id", async () => {
      mockFindTargetByMacAddress.mockResolvedValue(baseTarget);
      const res = await request(app)
        .post("/api/v1/targets/resolve")
        .send({ macAddresses: ["AA:BB:CC:DD:EE:FF"] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ targetId: baseTarget.id });
    });

    it("checks every provided MAC address, not just the first", async () => {
      mockFindTargetByMacAddress
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(baseTarget);
      const res = await request(app)
        .post("/api/v1/targets/resolve")
        .send({
          macAddresses: ["11:11:11:11:11:11", "AA:BB:CC:DD:EE:FF"],
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ targetId: baseTarget.id });
      expect(mockFindTargetByMacAddress).toHaveBeenCalledTimes(2);
    });
  });

  describe("PATCH /:id", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app)
        .patch(`/api/v1/targets/${baseTarget.id}`)
        .send({ name: "New name" });
      expect(res.status).toBe(404);
    });

    it("rejects an invalid MAC address with 400", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const res = await request(app)
        .patch(`/api/v1/targets/${baseTarget.id}`)
        .send({ macAddress: "not-a-mac" });
      expect(res.status).toBe(400);
    });

    it("updates only the fields provided", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockUpdateTarget.mockResolvedValue({ ...baseTarget, name: "New name" });
      const res = await request(app)
        .patch(`/api/v1/targets/${baseTarget.id}`)
        .send({ name: "New name" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New name");
      expect(mockUpdateTarget).toHaveBeenCalledWith(baseTarget.id, {
        name: "New name",
      });
    });
  });

  describe("DELETE /:id", () => {
    it("returns 404 when nothing was deleted", async () => {
      mockDeleteTarget.mockResolvedValue(false);
      const res = await request(app).delete(`/api/v1/targets/${baseTarget.id}`);
      expect(res.status).toBe(404);
    });

    it("returns 204 on a successful delete", async () => {
      mockDeleteTarget.mockResolvedValue(true);
      const res = await request(app).delete(`/api/v1/targets/${baseTarget.id}`);
      expect(res.status).toBe(204);
    });
  });

  describe("POST /:id/wake", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/wake`,
      );
      expect(res.status).toBe(404);
    });

    it("arms the wake flag BEFORE sending the packet, and returns sent:true on success", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const callOrder: string[] = [];
      mockArmWakeFlag.mockImplementation(async () => {
        callOrder.push("arm");
        return { triggeredAt: new Date("2026-01-01T00:00:01Z") };
      });
      mockSendMagicPacket.mockImplementation(async () => {
        callOrder.push("send");
        return { method: "dgram" };
      });

      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/wake`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        triggeredAt: "2026-01-01T00:00:01.000Z",
        sent: true,
      });
      // The write-order invariant: arming the flag must happen strictly
      // before the send attempt, never after — see CLAUDE.md.
      expect(callOrder).toEqual(["arm", "send"]);
    });

    it("still reports the armed flag with sent:false when the packet send fails", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockArmWakeFlag.mockResolvedValue({
        triggeredAt: new Date("2026-01-01T00:00:01Z"),
      });
      mockSendMagicPacket.mockRejectedValue(new Error("network unreachable"));

      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/wake`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        triggeredAt: "2026-01-01T00:00:01.000Z",
        sent: false,
      });
    });

    it("double-wake: two rapid wake calls each arm the flag (upsert dedup is the DB layer's job)", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockArmWakeFlag.mockResolvedValue({
        triggeredAt: new Date("2026-01-01T00:00:02Z"),
      });
      mockSendMagicPacket.mockResolvedValue({ method: "dgram" });

      await request(app).post(`/api/v1/targets/${baseTarget.id}/wake`);
      await request(app).post(`/api/v1/targets/${baseTarget.id}/wake`);

      expect(mockArmWakeFlag).toHaveBeenCalledTimes(2);
    });
  });

  describe("POST /:id/wol-flag/consume", () => {
    it("rejects a non-positive withinSeconds with 400", async () => {
      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: -5 });
      expect(res.status).toBe(400);
    });

    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 60 });
      expect(res.status).toBe(404);
    });

    it("returns woken:false when there is no fresh unconsumed flag", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockConsumeWakeFlag.mockResolvedValue({ woken: false });

      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ woken: false });
    });

    it("returns woken:true with triggeredAt when a fresh flag is consumed", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const triggeredAt = new Date("2026-01-01T00:00:01Z");
      mockConsumeWakeFlag.mockResolvedValue({ woken: true, triggeredAt });

      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        woken: true,
        triggeredAt: triggeredAt.toISOString(),
      });
    });

    it("a second consume call against an already-consumed flag returns woken:false", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockConsumeWakeFlag
        .mockResolvedValueOnce({ woken: true, triggeredAt: new Date() })
        .mockResolvedValueOnce({ woken: false });

      const first = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 60 });
      const second = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(first.body.woken).toBe(true);
      expect(second.body.woken).toBe(false);
    });

    it("accepts a withinSeconds value above the old 3600 cap, up to the new 14400 cap", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockConsumeWakeFlag.mockResolvedValue({ woken: false });

      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/wol-flag/consume`)
        .send({ withinSeconds: 7200 });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /:id/shutdown", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/shutdown`,
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when shutdownEnabled is false for this target", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockGetAgentConfig.mockResolvedValue({
        ...baseAgentConfig,
        shutdownEnabled: false,
      });

      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/shutdown`,
      );

      expect(res.status).toBe(400);
      expect(mockArmShutdownFlag).not.toHaveBeenCalled();
    });

    it("arms the shutdown flag when shutdownEnabled is true", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockGetAgentConfig.mockResolvedValue({
        ...baseAgentConfig,
        shutdownEnabled: true,
      });
      const triggeredAt = new Date("2026-01-01T00:00:01Z");
      mockArmShutdownFlag.mockResolvedValue({ triggeredAt });

      const res = await request(app).post(
        `/api/v1/targets/${baseTarget.id}/shutdown`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ triggeredAt: triggeredAt.toISOString() });
    });
  });

  describe("POST /:id/shutdown-flag/consume", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/shutdown-flag/consume`)
        .send({ withinSeconds: 60 });
      expect(res.status).toBe(404);
    });

    it("returns shutdown:false when there is no fresh unconsumed flag", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockConsumeShutdownFlag.mockResolvedValue({ shutdown: false });

      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/shutdown-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ shutdown: false });
    });

    it("returns shutdown:true with triggeredAt when a fresh flag is consumed", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const triggeredAt = new Date("2026-01-01T00:00:01Z");
      mockConsumeShutdownFlag.mockResolvedValue({
        shutdown: true,
        triggeredAt,
      });

      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/shutdown-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        shutdown: true,
        triggeredAt: triggeredAt.toISOString(),
      });
    });

    it("already-consumed: a second call against the same flag returns shutdown:false", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockConsumeShutdownFlag
        .mockResolvedValueOnce({ shutdown: true, triggeredAt: new Date() })
        .mockResolvedValueOnce({ shutdown: false });

      const first = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/shutdown-flag/consume`)
        .send({ withinSeconds: 60 });
      const second = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/shutdown-flag/consume`)
        .send({ withinSeconds: 60 });

      expect(first.body.shutdown).toBe(true);
      expect(second.body.shutdown).toBe(false);
    });
  });

  describe("POST /:id/status", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/status`)
        .send({});
      expect(res.status).toBe(404);
    });

    it("records the heartbeat and returns 204", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      const res = await request(app)
        .post(`/api/v1/targets/${baseTarget.id}/status`)
        .send({ agentVersion: "1.2.3" });

      expect(res.status).toBe(204);
      expect(mockRecordHeartbeat).toHaveBeenCalledWith(baseTarget.id, "1.2.3");
    });
  });

  describe("GET /:id/agent-config", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app).get(
        `/api/v1/targets/${baseTarget.id}/agent-config`,
      );
      expect(res.status).toBe(404);
    });

    it("returns the target's agent config", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);
      mockGetAgentConfig.mockResolvedValue({
        ...baseAgentConfig,
        wolAware: true,
      });

      const res = await request(app).get(
        `/api/v1/targets/${baseTarget.id}/agent-config`,
      );

      expect(res.status).toBe(200);
      expect(res.body.wolAware).toBe(true);
    });
  });

  describe("PUT /:id/agent-config", () => {
    it("returns 404 when the target does not exist", async () => {
      mockGetTargetById.mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v1/targets/${baseTarget.id}/agent-config`)
        .send({});
      expect(res.status).toBe(404);
    });

    it("upserts the agent config and echoes it back", async () => {
      mockGetTargetById.mockResolvedValue(baseTarget);

      const res = await request(app)
        .put(`/api/v1/targets/${baseTarget.id}/agent-config`)
        .send({
          wolAware: true,
          shutdownEnabled: true,
          wolScript: "C:\\a.ps1",
        });

      expect(res.status).toBe(200);
      expect(mockUpsertAgentConfig).toHaveBeenCalledWith(
        baseTarget.id,
        expect.objectContaining({
          wolAware: true,
          shutdownEnabled: true,
          wolScript: "C:\\a.ps1",
        }),
      );
    });
  });

  describe("external dependency failures", () => {
    it("propagates a DB failure as a generic 500 via the centralized error handler", async () => {
      mockListTargets.mockRejectedValue(new Error("DB unreachable"));
      const res = await request(app).get("/api/v1/targets");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Something went wrong" });
    });

    it("does not leak the internal error message in the response body", async () => {
      mockGetTargetById.mockRejectedValue(
        new Error("connection refused: 192.168.2.105"),
      );
      const res = await request(app).get(`/api/v1/targets/${baseTarget.id}`);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain("192.168.2.105");
    });
  });
});
