import express from "express";
import { validateBody } from "~/server/middleware/validateBody";
import { wakeLimiter, consumeLimiter } from "~/server/middleware/rateLimiter";
import {
  TargetCreateSchema,
  TargetUpdateSchema,
} from "~/shared/schemas/target";
import { WolFlagConsumeSchema } from "~/shared/schemas/wolFlag";
import {
  listTargets,
  getTargetById,
  findTargetByMacAddress,
  createTarget,
  updateTarget,
  deleteTarget,
} from "~/server/util/routes/targets";
import { normalizeMacAddress } from "~/server/util/wol/macAddress";
import { sendMagicPacket } from "~/server/util/wol/sendMagicPacket";
import { armWakeFlag, consumeWakeFlag } from "~/server/util/wol/wakeFlags";
import type { ITarget } from "~/server/database/models/target";

const apiLog = logger.child({ service: "api" });
const wolLog = logger.child({ service: "wol" });

export const router = express.Router();

function toApiTarget(
  entity: ITarget & { id: string; creation_time: Date; modified_time: Date },
) {
  return {
    id: entity.id,
    name: entity.name,
    macAddress: entity.mac_address,
    broadcastAddress: entity.broadcast_address,
    staticIp: entity.static_ip,
    notes: entity.notes,
    createdAt: entity.creation_time,
    updatedAt: entity.modified_time,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const targets = await listTargets();
    res.json(targets.map(toApiTarget));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const target = await getTargetById(req.params.id);
    if (!target) {
      res.status(404).json({ error: "Target not found" });
      return;
    }
    res.json(toApiTarget(target));
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(TargetCreateSchema), async (req, res, next) => {
  try {
    const macAddress = normalizeMacAddress(req.body.macAddress)!;
    const existing = await findTargetByMacAddress(macAddress);
    if (existing) {
      res
        .status(409)
        .json({ error: "A target with this MAC address already exists" });
      return;
    }
    const target = await createTarget({
      name: req.body.name,
      mac_address: macAddress,
      broadcast_address: req.body.broadcastAddress ?? null,
      static_ip: req.body.staticIp ?? null,
      notes: req.body.notes ?? null,
    });
    apiLog.info({ targetId: target.id }, "Target created");
    res.status(201).json(toApiTarget(target));
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id",
  validateBody(TargetUpdateSchema),
  async (req: express.Request<{ id: string }>, res, next) => {
    try {
      const existing = await getTargetById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Target not found" });
        return;
      }
      if (req.body.macAddress) {
        const normalized = normalizeMacAddress(req.body.macAddress)!;
        const macOwner = await findTargetByMacAddress(normalized);
        if (macOwner && macOwner.id !== existing.id) {
          res
            .status(409)
            .json({ error: "A target with this MAC address already exists" });
          return;
        }
      }
      const target = await updateTarget(req.params.id, {
        ...(req.body.name !== undefined && { name: req.body.name }),
        ...(req.body.macAddress !== undefined && {
          mac_address: normalizeMacAddress(req.body.macAddress)!,
        }),
        ...(req.body.broadcastAddress !== undefined && {
          broadcast_address: req.body.broadcastAddress,
        }),
        ...(req.body.staticIp !== undefined && {
          static_ip: req.body.staticIp,
        }),
        ...(req.body.notes !== undefined && { notes: req.body.notes }),
      });
      apiLog.info({ targetId: req.params.id }, "Target updated");
      res.json(toApiTarget(target!));
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await deleteTarget(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Target not found" });
      return;
    }
    apiLog.info({ targetId: req.params.id }, "Target deleted");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/wake",
  wakeLimiter,
  async (req: express.Request<{ id: string }>, res, next) => {
    try {
      const target = await getTargetById(req.params.id);
      if (!target) {
        res.status(404).json({ error: "Target not found" });
        return;
      }

      apiLog.info(
        { targetId: target.id, targetName: target.name },
        "Wake requested",
      );

      // Write the flag BEFORE sending the packet — if the send later fails,
      // the orphaned flag is harmless (nothing calls consume against it), but
      // the reverse ordering could leave a real boot with no flag to check.
      const { triggeredAt } = await armWakeFlag(target.id);
      wolLog.info({ targetId: target.id, triggeredAt }, "Wake flag armed");

      const broadcastAddress =
        target.broadcast_address ||
        process.env.WOL_DEFAULT_BROADCAST_ADDRESS ||
        "255.255.255.255";

      try {
        const { method } = await sendMagicPacket(
          target.mac_address,
          broadcastAddress,
        );
        wolLog.info(
          {
            targetId: target.id,
            mac: target.mac_address,
            broadcastAddress,
            method,
          },
          "Magic packet sent",
        );
        res.json({ triggeredAt, sent: true });
      } catch (sendError) {
        wolLog.error(
          { err: sendError, targetId: target.id, mac: target.mac_address },
          "Magic packet send failed",
        );
        res.json({ triggeredAt, sent: false });
      }
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/wol-flag/consume",
  consumeLimiter,
  validateBody(WolFlagConsumeSchema),
  async (req: express.Request<{ id: string }>, res, next) => {
    try {
      const target = await getTargetById(req.params.id);
      if (!target) {
        res.status(404).json({ error: "Target not found" });
        return;
      }
      const result = await consumeWakeFlag(target.id, req.body.withinSeconds);
      wolLog.info(
        {
          targetId: target.id,
          withinSeconds: req.body.withinSeconds,
          result: result.woken ? "woken" : "not_woken",
        },
        "Wake flag consume checked",
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);
