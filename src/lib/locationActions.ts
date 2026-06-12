import { lifeSkillKindOf, type LifeSkillKind } from "./lifeSkillData";

type ActionLike = {
  kind: string;
  label: string | null;
};

const norm = (value: string) => value.replace(/\s+/g, "").toLowerCase();

function isGenericLifeAction(action: ActionLike, kind: LifeSkillKind): boolean {
  return !action.label || norm(action.label) === norm(kind);
}

export function dedupeLifeActions<T extends ActionLike>(actions: T[]): T[] {
  const hasSpecific = new Set<LifeSkillKind>();
  for (const action of actions) {
    const kind = lifeSkillKindOf(action.kind, action.label);
    if (!kind) continue;
    if (!isGenericLifeAction(action, kind)) hasSpecific.add(kind);
  }

  return actions.filter((action) => {
    const kind = lifeSkillKindOf(action.kind, action.label);
    if (!kind || !hasSpecific.has(kind)) return true;
    return !isGenericLifeAction(action, kind);
  });
}
