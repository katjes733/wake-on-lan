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

// Rate limiting talks to a real Redis client — irrelevant at this layer and
// would otherwise require a live Redis for these tests to even run.
vi.mock("~/server/middleware/rateLimiter", () => ({
  wakeLimiter: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => next(),
  consumeLimiter: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

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

describe("targets router", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  describe("GET /", () => {
    it("returns all targets mapped to the API (camelCase) shape", async () => {
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
        },
      ]);
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
