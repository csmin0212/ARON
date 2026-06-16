import "server-only";

import { prisma } from "./prisma";
import type { LifeSkillKind } from "./lifeSkillData";
import type { LifeSkillCatalogEntry, PerkRarity } from "./lifeSkillPerks";

const LIFE_KINDS = new Set<LifeSkillKind>(["낚시", "채집"]);
const RARITIES = new Set<PerkRarity>(["일반", "레어", "유니크", "전설", "신화"]);

export async function fetchLifeSkillCatalog(): Promise<LifeSkillCatalogEntry[] | undefined> {
  try {
    const rows = await prisma.skill.findMany({
      where: {
        category: "생활",
        enabled: true,
        kind: { in: ["낚시", "채집"] },
        OR: [{ type: "특성" }, { type: null }],
      },
      select: {
        kind: true,
        name: true,
        rarity: true,
        description: true,
        effectKey: true,
        effectValue: true,
      },
      orderBy: { order: "asc" },
    });

    const catalog = rows.flatMap((row) => {
      if (!LIFE_KINDS.has(row.kind as LifeSkillKind)) return [];
      if (!RARITIES.has(row.rarity as PerkRarity)) return [];
      return [
        {
          kind: row.kind as LifeSkillKind,
          name: row.name,
          rarity: row.rarity as PerkRarity,
          text: row.description ?? "",
          effectKey: row.effectKey,
          effectValue: row.effectValue,
        },
      ];
    });

    return catalog.length > 0 ? catalog : undefined;
  } catch {
    return undefined;
  }
}
