import type { SheetEquipment, SheetEquipmentSlot } from "@/lib/googleSheets";

function slotStats(slot: SheetEquipmentSlot): string {
  const stats = Object.entries(slot.stats)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([label, value]) => `${label} ${value}`);
  return stats.join(" · ");
}

function groupLabel(group: SheetEquipmentSlot["group"]): string {
  if (group === "weapon") return "무기&방패";
  if (group === "armor") return "방어구";
  return "장신구";
}

export default function EquipmentPanel({
  equipment,
}: {
  equipment: SheetEquipment | null;
}) {
  const slots = equipment?.slots ?? [];
  if (slots.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-faint">장비</p>
        {(equipment?.weaponWeightText || equipment?.armorWeightText) && (
          <p className="text-[11px] font-semibold text-faint">
            {[equipment.weaponWeightText, equipment.armorWeightText].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const stats = slotStats(slot);
          return (
            <div key={slot.id} className="rounded-2xl border border-line bg-subtle px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-faint">
                    {groupLabel(slot.group)} · {slot.label}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-extrabold text-content">
                    {slot.name ?? "미장착"}
                  </p>
                </div>
                {slot.weight != null && (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-black text-muted">
                    중량 {slot.weight}
                  </span>
                )}
              </div>
              {stats && <p className="mt-1 text-[11px] font-semibold text-brand-600">{stats}</p>}
              {slot.effect && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-snug text-faint">
                  {slot.effect}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
