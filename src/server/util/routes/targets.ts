import AppDataSource from "~/server/database/datasource";
import { Target, type ITarget } from "~/server/database/models/target";

export async function listTargets() {
  const ds = await AppDataSource.getInstance();
  return ds.getRepository(Target).find({ order: { name: "ASC" } });
}

export async function getTargetById(id: string) {
  const ds = await AppDataSource.getInstance();
  return ds.getRepository(Target).findOne({ where: { id } });
}

export async function findTargetByMacAddress(macAddress: string) {
  const ds = await AppDataSource.getInstance();
  return ds
    .getRepository(Target)
    .findOne({ where: { mac_address: macAddress } });
}

export async function createTarget(input: ITarget) {
  const ds = await AppDataSource.getInstance();
  const repo = ds.getRepository(Target);
  const now = new Date();
  const entity = repo.create({
    ...input,
    creation_time: now,
    modified_time: now,
  });
  return repo.save(entity);
}

export async function updateTarget(id: string, input: Partial<ITarget>) {
  const ds = await AppDataSource.getInstance();
  const repo = ds.getRepository(Target);
  await repo.update({ id }, { ...input, modified_time: new Date() });
  return repo.findOne({ where: { id } });
}

export async function deleteTarget(id: string): Promise<boolean> {
  const ds = await AppDataSource.getInstance();
  const result = await ds.getRepository(Target).delete({ id });
  return (result.affected ?? 0) > 0;
}
