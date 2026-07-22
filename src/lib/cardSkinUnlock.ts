import { parseLifeState, alchemyLevel } from "@/lib/lifeSkillPerks";
import {
  resolveOwnedSkins,
  type LifeSkillKey,
  type ProfileCardStyle,
  type UnlockContext,
} from "@/lib/profileCard";

type SheetLike =
  | { adventurerRank?: string | null; lifeJson?: string | null }
  | null
  | undefined;

// 캐릭터 시트 → 조건 해금 판정용 컨텍스트(모험가 등급 + 생활스킬 레벨).
export function unlockContext(sheet: SheetLike): UnlockContext {
  const life = parseLifeState(sheet?.lifeJson);
  return {
    rank: sheet?.adventurerRank ?? null,
    life: {
      fishing: life.fishing.level,
      plant: life.plant.level,
      mining: life.mining.level,
      cooking: life.cooking.level,
      smithing: life.smithing.level,
      alchemy: alchemyLevel(life),
    } as Record<LifeSkillKey, number>,
  };
}

// 저장된 보유(구매·보상) + 조건 해금을 합친 최종 보유 목록.
export function ownedSkinsForSheet(
  ownedJson: string | null | undefined,
  sheet: SheetLike,
): ProfileCardStyle[] {
  return resolveOwnedSkins(ownedJson, unlockContext(sheet));
}
