import type { StatEntry } from "@/lib/charsheet";
import type { SheetEquipment } from "@/lib/googleSheets";
import type { LanternEmberBuff } from "@/lib/lanternEmbers";
import { lanternHpBonus, lanternMpBonus } from "@/lib/lanternEmbers";
import { adventurerRankGoal, normalizeAdventurerRank, totalFameForRank } from "@/lib/adventurerRank";
import EquipmentPanel from "./EquipmentPanel";

export type SheetData = {
  charName: string | null;
  charClass: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  statsJson: string | null;
  equipmentJson?: string | null;
  // 라이브 상태 (있으면 현재값으로 표시)
  curHp?: number | null;
  curMp?: number | null;
  curGold?: number | null;
  adventurerRank?: string | null;
  fame?: number | null;
  lanternEmbers?: LanternEmberBuff[];
};

function Stat({ s }: { s: StatEntry }) {
  const mod = s.mod ?? 0;
  return (
    <div className="rounded-2xl border border-line bg-subtle px-2 py-2 text-center transition hover:border-brand-300 hover:bg-brand-50">
      <div className="text-[11px] font-bold text-faint">{s.label}</div>
      <div className="text-lg font-extrabold text-content">{s.value ?? "-"}</div>
      <div className="mt-0.5 inline-block rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">
        2D{mod >= 0 ? `+${mod}` : mod}
      </div>
    </div>
  );
}

function Vital({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: string;
  label: string;
  value: string | number | null;
  color: string;
  bg: string;
}) {
  return (
    <div className={`flex-1 rounded-2xl ${bg} px-2 py-2.5 text-center`}>
      <div className="text-[11px] font-bold text-faint">
        <span className="mr-0.5">{icon}</span>
        {label}
      </div>
      <div className={`mt-0.5 text-base font-extrabold ${color}`}>{value ?? "-"}</div>
    </div>
  );
}

function currentMaxValue(current: number | null | undefined, max: number | null): string | number | null {
  if (current == null || max == null) return max;
  return current === max ? max : `${current}/${max}`;
}

export default function CharacterSheetCard({
  sheet,
}: {
  sheet: SheetData;
}) {
  let stats: StatEntry[] = [];
  try {
    stats = sheet.statsJson ? (JSON.parse(sheet.statsJson) as StatEntry[]) : [];
  } catch {
    stats = [];
  }
  let equipment: SheetEquipment | null = null;
  try {
    equipment = sheet.equipmentJson ? (JSON.parse(sheet.equipmentJson) as SheetEquipment) : null;
  } catch {
    equipment = null;
  }

  const tags = [sheet.charClass, sheet.race, sheet.attribute && `속성 ${sheet.attribute}`].filter(
    Boolean,
  ) as string[];
  const rank = normalizeAdventurerRank(sheet.adventurerRank);
  const fame = totalFameForRank(rank, sheet.fame);
  const rankGoal = adventurerRankGoal(rank);
  const rankPct = rankGoal > 0 ? Math.min(100, Math.round((fame / rankGoal) * 100)) : 100;
  const lanternEmbers = sheet.lanternEmbers ?? [];
  const maxHp = sheet.hp == null ? null : sheet.hp + lanternHpBonus(lanternEmbers);
  const maxMp = sheet.mp == null ? null : sheet.mp + lanternMpBonus(lanternEmbers);

  return (
    <div className="space-y-4">
      {/* 캐릭터명 / 클래스 / 종족 */}
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl shadow-sm">
          📜
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-extrabold text-content">
              {sheet.charName ?? "캐릭터"}
            </span>
            {sheet.level != null && (
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
                Lv.{sheet.level}
              </span>
            )}
          </div>
          {tags.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
              {tags.map((t, i) => (
                <span key={i} className="rounded bg-subtle px-1.5 py-0.5 font-medium">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* 모험가 랭크 */}
      <div className="rounded-2xl border border-line bg-subtle px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-faint">모험가 랭크</p>
            <p className="text-sm font-extrabold text-content">길드 등급 {rank}</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-2xl font-black text-white shadow-sm">
            {rank}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-brand-500"
            style={{ width: `${rankPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-right text-[11px] font-semibold text-faint">
          {rankGoal > 0
            ? `남은 명성치 ${Math.max(0, rankGoal - fame).toLocaleString()} · ${fame.toLocaleString()} / ${rankGoal.toLocaleString()}`
            : "최고 등급"}
        </p>
      </div>

      {/* HP / MP / 페이트 / 소지금 (라이브 상태 우선) */}
      <div className="flex gap-2">
        <Vital
          icon="❤️"
          label="HP"
          value={currentMaxValue(sheet.curHp, maxHp)}
          color="text-rose-500"
          bg="bg-rose-500/10"
        />
        <Vital
          icon="💧"
          label="MP"
          value={currentMaxValue(sheet.curMp, maxMp)}
          color="text-sky-500"
          bg="bg-sky-500/10"
        />
        <Vital
          icon="🍀"
          label="페이트"
          value={sheet.fate}
          color="text-amber-500"
          bg="bg-amber-500/10"
        />
        <Vital
          icon="🪙"
          label="소지금"
          value={sheet.curGold != null ? `${sheet.curGold.toLocaleString()}G` : sheet.gold}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
      </div>

      {/* 능력치 */}
      {stats.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-faint">능력치</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {stats.map((s) => (
              <Stat key={s.key} s={s} />
            ))}
          </div>
        </div>
      )}

      {lanternEmbers.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-faint">등불 효과</p>
          <div className="space-y-2">
            {lanternEmbers.map((ember) => (
              <div key={ember.key} className="rounded-2xl border border-amber-200 bg-amber-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-extrabold text-amber-900">
                    <span className="mr-1">{ember.icon}</span>
                    {ember.title}
                  </p>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    {ember.statLine}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-800/80">{ember.flavor}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <EquipmentPanel equipment={equipment} />
    </div>
  );
}
