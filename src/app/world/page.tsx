import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { FATIGUE_MAX, effectiveAp, nextFatigueRegenMinutes } from "@/lib/world";
import { enterWorld, moveTo } from "@/app/actions/world";
import Avatar from "@/components/Avatar";
import BagInventory from "@/components/BagInventory";
import WorldAdmin from "@/components/WorldAdmin";
import WorldChat from "@/components/WorldChat";
import WorldServices from "@/components/WorldServices";
import { inventoryWeightTotal, type SheetInventory, type SheetInventoryItem } from "@/lib/googleSheets";
import { dedupeLifeActions } from "@/lib/locationActions";
import type { LocationLifeConfig } from "@/lib/lifeSkillData";

export const metadata = { title: "월드 · 아리안로드 온라인 갤러리" };

function ApBar({ ap, nextRegenMin }: { ap: number; nextRegenMin: number | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="text-lg">⚡</span>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-bold text-content">피로도</span>
          <span className="font-semibold text-muted">
            {ap} / {FATIGUE_MAX}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle-hover">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
            style={{ width: `${(ap / FATIGUE_MAX) * 100}%` }}
          />
        </div>
      </div>
      <span className="text-[11px] text-faint">
        {nextRegenMin == null ? "완전히 회복됨" : `다음 회복까지 ${nextRegenMin}분`}
      </span>
      <button
        type="button"
        disabled
        className="rounded-xl border border-line bg-subtle px-3 py-2 text-xs font-bold text-faint opacity-70"
        title="피로도 회복 아이템은 추후 활성화됩니다"
      >
        회복
      </button>
    </div>
  );
}

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function parseSheetInventory(value: string | null | undefined): SheetInventory | null {
  try {
    return value ? (JSON.parse(value) as SheetInventory) : null;
  } catch {
    return null;
  }
}

function parseLocationLife(value: string | null | undefined): LocationLifeConfig | null {
  try {
    return value ? (JSON.parse(value) as LocationLifeConfig) : null;
  } catch {
    return null;
  }
}

function activityBadges(life: LocationLifeConfig | null): { label: string; tone: string }[] {
  if (!life) return [];
  return [
    life.gather?.enabled ? { label: "🌿 채집 가능", tone: "bg-emerald-50 text-emerald-700" } : null,
    life.fish?.enabled ? { label: "🎣 낚시 가능", tone: "bg-sky-50 text-sky-700" } : null,
    life.combat?.enabled ? { label: "⚔️ 전투 가능", tone: "bg-rose-50 text-rose-700" } : null,
  ].filter((badge): badge is { label: string; tone: string } => !!badge);
}

function hasServiceKeyword(
  here: { id: string; name: string },
  actions: { kind: string; label: string | null }[],
  keywords: string[],
): boolean {
  const source = [here.id, here.name, ...actions.flatMap((a) => [a.kind, a.label ?? ""])]
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => source.includes(keyword.toLowerCase()));
}

export default async function WorldPage() {
  const user = await getCurrentUser();
  const isGm = isGmUsername(user?.username);

  if (!user) {
    return (
      <Gate emoji="🗺️" title="월드에 입장하려면 로그인이 필요해요">
        <Link href="/login" className="font-bold text-brand-600 hover:underline">
          로그인하러 가기
        </Link>
      </Gate>
    );
  }

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });

  if (!sheet) {
    return (
      <Gate emoji="📜" title="캐릭터 시트를 먼저 연동해주세요">
        <p className="mb-3 text-sm text-faint">월드는 캐릭터의 능력치로 플레이해요.</p>
        <Link href="/profile" className="font-bold text-brand-600 hover:underline">
          프로필에서 연동하기 →
        </Link>
      </Gate>
    );
  }

  const locationCount = await prisma.location.count();

  if (locationCount === 0) {
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <Gate emoji="🛠️" title="월드 준비 중이에요">
          <p className="text-sm text-faint">GM이 맵을 만들고 있어요. 조금만 기다려주세요!</p>
        </Gate>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  const ap = effectiveAp(sheet.ap, sheet.apResetAt);
  const nextRegenMin = nextFatigueRegenMinutes(sheet.ap, sheet.apResetAt);
  const here = sheet.locationId
    ? await prisma.location.findUnique({ where: { id: sheet.locationId } })
    : null;

  if (!here) {
    const start = await prisma.location.findFirst({ where: { isStart: true } });
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">{start?.emoji ?? "🗺️"}</div>
          <h1 className="text-xl font-extrabold text-content">모험을 시작해볼까요?</h1>
          <p className="mt-2 text-sm text-faint">
            {start ? `시작 지점: ${start.name}` : "시작 지점이 설정되지 않았어요."}
          </p>
          {start && (
            <form action={enterWorld} className="mt-5">
              <button
                type="submit"
                className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
              >
                🚪 월드 입장
              </button>
            </form>
          )}
        </div>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  const connIds = parseJsonArray(here.connJson);
  const hereLife = parseLocationLife(here.lifeJson);
  const badges = activityBadges(hereLife);
  const discovered = parseJsonArray(sheet.discoveredJson);
  const destinations = (
    await prisma.location.findMany({ where: { id: { in: connIds } }, orderBy: { order: "asc" } })
  ).filter((d) => !d.hidden || discovered.includes(d.id));

  const others = await prisma.characterSheet.findMany({
    where: { locationId: here.id, userId: { not: user.id } },
    include: { user: { select: { username: true, nickname: true, avatar: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const [rawLocActions, invEntries] = await Promise.all([
    prisma.locationAction.findMany({ where: { locationId: here.id }, orderBy: { order: "asc" } }),
    prisma.inventoryEntry.findMany({
      where: { userId: user.id, qty: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const locActions = dedupeLifeActions(rawLocActions);

  const itemNames = new Map(
    (
      await prisma.item.findMany({
        where: { id: { in: invEntries.map((e) => e.itemId) } },
        select: { id: true, name: true },
      })
    ).map((it) => [it.id, it.name]),
  );

  const sheetInventory = parseSheetInventory(sheet.invJson);
  const bagItems: SheetInventoryItem[] =
    sheetInventory?.items && sheetInventory.items.length > 0
      ? sheetInventory.items
      : invEntries.map((e) => ({
          name: itemNames.get(e.itemId) ?? e.itemId,
          effect: null,
          weight: null,
          qty: e.qty,
        }));
  const bagGold = sheetInventory?.gold ?? `${(sheet.curGold ?? 0).toLocaleString()}G`;
  const computedBagWeight = inventoryWeightTotal(bagItems);
  const bagWeight =
    (computedBagWeight ?? sheetInventory?.curWeight) != null && sheetInventory?.maxWeight != null
      ? `${computedBagWeight ?? sheetInventory.curWeight} / ${sheetInventory.maxWeight}`
      : null;
  const canForge = hasServiceKeyword(here, locActions, [
    "상점",
    "시장",
    "잡화",
    "구매",
    "shop",
    "store",
    "market",
    "대장간",
    "강화",
    "제련",
    "forge",
    "smith",
    "blacksmith",
  ]);

  return (
    <div className="animate-fadeup space-y-4 py-1">
      <ApBar ap={ap} nextRegenMin={nextRegenMin} />

      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="relative">
          {here.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={here.image}
              alt={here.name}
              className="h-44 w-full object-cover sm:h-60"
            />
          ) : (
            <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-brand-500 to-brand-700 sm:h-60">
              <span className="text-7xl drop-shadow">{here.emoji ?? "📍"}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-6 pb-4 pt-12">
            <p className="text-[11px] font-semibold text-white/70">현재 위치</p>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white drop-shadow">
              {here.emoji && <span>{here.emoji}</span>} {here.name}
            </h1>
          </div>
        </div>
        {here.desc && (
          <p className="whitespace-pre-wrap px-6 py-4 text-[15px] leading-relaxed text-content">
            {here.desc}
          </p>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line px-6 py-3">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${badge.tone}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorldChat
            key={here.id}
            locationName={here.name}
            myUsername={user.username}
            actions={locActions.map((a) => ({
              kind: a.kind,
              label: a.label,
              apCost: a.apCost,
            }))}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
              🧭 이동 가능 구역
            </h2>
            {destinations.length === 0 ? (
              <p className="py-3 text-center text-sm text-faint">이동할 수 있는 곳이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {destinations.map((d) => (
                  <form key={d.id} action={moveTo}>
                    <input type="hidden" name="target" value={d.id} />
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      <span className="text-xl">{d.emoji ?? "📍"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-content">
                          {d.name}
                        </span>
                        {d.hidden && (
                          <span className="text-[11px] font-semibold text-violet-500">
                            발견한 장소
                          </span>
                        )}
                      </span>
                      <span className="ml-auto text-faint2">→</span>
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>

          <WorldServices
            canForge={canForge}
            inventoryItems={bagItems}
          />

          <BagInventory gold={bagGold} weight={bagWeight} items={bagItems} />

          <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
              👥 이곳의 모험가 <span className="text-brand-500">{others.length + 1}</span>
            </h2>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2.5 rounded-xl bg-brand-50/60 px-3 py-2">
                <Avatar name={user.nickname} avatar={user.avatar} size={26} />
                <span className="truncate text-sm font-bold text-content">{user.nickname}</span>
                <span className="ml-auto rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
                  나
                </span>
              </li>
              {others.map((o) => (
                <li
                  key={o.userId}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-subtle"
                >
                  <Avatar name={o.user.nickname} avatar={o.user.avatar} size={26} />
                  <Link
                    href={`/u/${encodeURIComponent(o.user.username)}`}
                    className="truncate text-sm font-bold text-content transition hover:text-brand-600 hover:underline"
                  >
                    {o.user.nickname}
                  </Link>
                </li>
              ))}
            </ul>
            {others.length === 0 && (
              <p className="mt-1 px-3 text-xs text-faint">지금은 혼자 있어요.</p>
            )}
          </div>
        </div>
      </div>

      {isGm && <WorldAdmin />}
    </div>
  );
}

function Gate({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl animate-fadeup py-6">
      <div className="rounded-3xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mb-3 text-5xl">{emoji}</div>
        <h1 className="mb-2 text-xl font-extrabold text-content">{title}</h1>
        {children}
      </div>
    </div>
  );
}
