import type { StatEntry } from "@/lib/charsheet";

export type SheetData = {
  charName: string | null;
  charClass: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  statsJson: string | null;
};

function Stat({ s }: { s: StatEntry }) {
  const mod = s.mod ?? 0;
  return (
    <div className="rounded-xl border border-line bg-subtle px-2 py-2 text-center">
      <div className="text-[11px] font-bold text-faint">{s.label}</div>
      <div className="text-lg font-extrabold text-content">{s.value ?? "-"}</div>
      <div className="text-[10px] font-semibold text-brand-600">
        2D{mod >= 0 ? `+${mod}` : mod}
      </div>
    </div>
  );
}

function Vital({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex-1 rounded-xl bg-subtle px-3 py-2 text-center">
      <div className="text-[11px] font-bold text-faint">{label}</div>
      <div className={`text-lg font-extrabold ${color}`}>{value ?? "-"}</div>
    </div>
  );
}

export default function CharacterSheetCard({ sheet }: { sheet: SheetData }) {
  let stats: StatEntry[] = [];
  try {
    stats = sheet.statsJson ? (JSON.parse(sheet.statsJson) as StatEntry[]) : [];
  } catch {
    stats = [];
  }

  return (
    <div className="space-y-4">
      {/* 클래스 / 레벨 / 이름 */}
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl shadow-sm">
          📜
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-content">
              {sheet.charClass ?? "클래스 미설정"}
            </span>
            {sheet.level != null && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
                Lv.{sheet.level}
              </span>
            )}
          </div>
          {sheet.charName && <p className="truncate text-sm text-muted">{sheet.charName}</p>}
        </div>
      </div>

      {/* HP / MP / 페이트 / 소지금 */}
      <div className="flex gap-2">
        <Vital label="HP" value={sheet.hp} color="text-rose-500" />
        <Vital label="MP" value={sheet.mp} color="text-sky-500" />
        <Vital label="페이트" value={sheet.fate} color="text-amber-500" />
        <div className="flex-1 rounded-xl bg-subtle px-3 py-2 text-center">
          <div className="text-[11px] font-bold text-faint">소지금</div>
          <div className="text-lg font-extrabold text-emerald-500">{sheet.gold ?? "-"}</div>
        </div>
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
    </div>
  );
}
