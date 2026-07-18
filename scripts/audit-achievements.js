// 업적 실데이터 감사 — 엔진 판정(카운터·레벨·도감·재화형)을 재현해
// "조건 충족했는데 미획득" / "미충족인데 획득" 유저×업적을 찾는다. (읽기 전용)
const fs = require("fs"), path = require("path");
try { for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v; } } } catch {}
const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
const prisma = new PrismaClient();

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const num = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isNaN(n) ? null : n; };
const RANK_ORDER = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const TIER_ORDER = { small: 1, standard: 2, luxury: 3 };
const ADEPT = 60, MASTER = 300;

(async () => {
  const [achs, users, lifeItems, locs] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.characterSheet.findMany({
      include: { user: { select: { nickname: true, equippedTitle: true, equippedBadge: true, achievements: { select: { achId: true } } } } },
    }),
    prisma.lifeSkillItem.findMany({ select: { kind: true, name: true, rank: true } }),
    prisma.location.findMany({ select: { id: true, hidden: true, isStart: true } }),
  ]);
  const pool = { 낚시: lifeItems.filter(i => i.kind === "낚시"), 채집: lifeItems.filter(i => i.kind === "채집"), 채광: lifeItems.filter(i => i.kind === "채광") };
  const rankOf = {}; for (const k of ["낚시", "채집", "채광"]) rankOf[k] = new Map(pool[k].map(i => [i.name, i.rank]));
  const poolNames = {}; for (const k of ["낚시", "채집", "채광"]) poolNames[k] = new Set(pool[k].map(i => i.name));
  const locById = new Map(locs.map(l => [l.id, l]));

  const missed = [], over = [], skippedTypes = new Set();

  for (const sheet of users) {
    if (!sheet.user) continue;
    const earned = new Set(sheet.user.achievements.map(a => a.achId));
    const stats = J(sheet.achStatsJson, {});
    const life = J(sheet.lifeJson, {});
    const housing = J(sheet.housingJson, {});
    const owned = Array.isArray(housing.owned) ? housing.owned : (sheet.houseTier ? [sheet.houseTier] : []);
    const bags = life.bags ?? {};
    const coll = life.collection ?? {};
    const counts = life.catchCounts ?? {};
    const mastery = life.alchemyMastery ?? {};
    const masterCnt = Object.values(mastery).filter(v => v >= MASTER).length;
    const adeptCnt = Object.values(mastery).filter(v => v >= ADEPT).length;
    const lvl = (k) => life[k]?.level ?? 1;
    const prefixCnt = (p) => Object.entries(stats).filter(([k, v]) => k.startsWith(p) && v > 0).length;
    const maxSame = (k) => Math.max(0, ...Object.values(counts[k] ?? {}));
    const bestRank = (k) => (coll[k] ?? []).reduce((m, n) => Math.max(m, rankOf[k].get(n) ?? 0), 0);
    const inPool = (k) => (coll[k] ?? []).filter(n => poolNames[k].has(n)).length;
    const pct = (k) => poolNames[k].size ? (inPool(k) / poolNames[k].size) * 100 : 0;
    const bagW = (k) => (bags[k]?.items ?? []).reduce((s, i) => s + (i.weight ?? 1) * Math.max(0, i.qty ?? 0), 0);
    const visited = new Set([...J(sheet.visitedJson, []), ...J(sheet.discoveredJson, []), sheet.locationId].filter(Boolean));
    let hiddenV = 0, publicV = 0, startV = false;
    for (const id of visited) { const l = locById.get(id); if (!l) continue; if (l.isStart) startV = true; l.hidden ? hiddenV++ : publicV++; }
    const titles = achs.filter(a => earned.has(a.id) && a.rewardTitle).length;
    const furn = (housing.items ?? []).length + Object.values(housing.furniture ?? {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
    const houseMax = owned.reduce((m, t) => Math.max(m, TIER_ORDER[t] ?? 0), 0);
    const rankReq = (a) => { const e = num(a.condValue); if (e != null) return e; const f = a.id.match(/(?:^|_)r(\d+)(?:_|$)/i)?.[1]; return f ? Number(f) : null; };

    const evalOne = (a) => {
      const n = num(a.condValue);
      switch (a.condType) {
        case "명성": return n != null && (sheet.fame ?? 0) >= n;
        case "골드보유": return n != null && (sheet.curGold ?? 0) >= n;
        case "낚시레벨": return n != null && lvl("fishing") >= n;
        case "채집레벨": return n != null && lvl("plant") >= n;
        case "채광레벨": return n != null && lvl("mining") >= n;
        case "요리레벨": case "요리숙련레벨": return n != null && lvl("cooking") >= n;
        case "대장레벨": case "대장간레벨": case "제작레벨": return n != null && lvl("smithing") >= n;
        case "연금술레벨": case "연금레벨": return n != null && (1 + masterCnt) >= n;
        case "연금장인수": case "연금명품수": return n != null && masterCnt >= n;
        case "연금숙련포션수": case "연금고급수": return n != null && adeptCnt >= n;
        case "제작광물종류수": return n != null && prefixCnt("제작광물:") >= n;
        case "낚시도감등록수": return n != null && (coll.낚시 ?? []).length >= n;
        case "채집도감등록수": return n != null && (coll.채집 ?? []).length >= n;
        case "채광도감등록수": return n != null && (coll.채광 ?? []).length >= n;
        case "낚시도감완성률": return n != null && pct("낚시") >= n;
        case "채집도감완성률": return n != null && pct("채집") >= n;
        case "채광도감완성률": return n != null && pct("채광") >= n;
        case "희귀도낚시": return rankReq(a) != null && bestRank("낚시") >= rankReq(a);
        case "희귀도채집": return rankReq(a) != null && bestRank("채집") >= rankReq(a);
        case "희귀도채광": return rankReq(a) != null && bestRank("채광") >= rankReq(a);
        case "동일낚시획득": return n != null && maxSame("낚시") >= n;
        case "동일채집획득": return n != null && maxSame("채집") >= n;
        case "동일채광획득": return n != null && maxSame("채광") >= n;
        case "낚시지역성공수": return n != null && prefixCnt("낚시지역:") >= n;
        case "채집지역성공수": return n != null && prefixCnt("채집지역:") >= n;
        case "채광지역성공수": return n != null && prefixCnt("채광지역:") >= n;
        case "낚시가방중량": return n != null && bagW("낚시") >= n;
        case "채집가방중량": return n != null && bagW("채집") >= n;
        case "채광가방중량": return n != null && bagW("채광") >= n;
        case "낚시가방최대중량": return n != null && (bags.낚시?.maxWeight ?? 0) >= n;
        case "채집가방최대중량": return n != null && (bags.채집?.maxWeight ?? 0) >= n;
        case "채광가방최대중량": return n != null && (bags.채광?.maxWeight ?? 0) >= n;
        case "가구배치수": return n != null && furn >= n;
        case "최초발견": return n != null && J(sheet.discoveredJson, []).length >= n;
        case "칭호보유수": return n != null && titles >= n;
        case "업적달성수": return n != null && earned.size >= n;
        case "집구매": return owned.length >= (n ?? 1);
        case "칭호장착": return !!sheet.user.equippedTitle;
        case "히든장소방문": return n != null ? hiddenV >= n : null;
        case "층전체방문": return null;
        case "장소방문": return a.id === "visit_belltower" ? startV : null;
        case "지역그룹방문": { const src = `${a.condValue ?? ""} ${a.desc ?? ""}`; if (/2\s*층/.test(src)) return false; const g = n ?? (src.match(/(\d+)\s*곳/) ? Number(src.match(/(\d+)\s*곳/)[1]) : null); return g != null ? publicV >= g : null; }
        case "요리레시피수": return null; // DB count 필요 — 별도
        case "게시글작성수": case "댓글작성수": case "추천횟수": return null; // DB count — 별도
        case "요리등급": { if (n != null) return (stats.요리최고등급 ?? 0) >= n; const s = `${a.condValue ?? ""}${a.desc ?? ""}${a.name}`; const made = stats.요리최고제작등급 ?? 0; if (/장인|서명작/.test(s)) return made >= 3; if (/걸작|명품/.test(s)) return made >= 2; if (/희귀|고품질/.test(s)) return made >= 1; return false; }
        case "제작등급": { const made = stats.제작최고제작등급 ?? 0; if (n != null) return made >= n; const s = `${a.desc ?? ""}${a.name}`; if (/장인/.test(s)) return made >= 3; if (/명품|걸작/.test(s)) return made >= 2; if (/고품질|희귀/.test(s)) return made >= 1; return false; }
        case "요리태그": { const s = `${a.condValue ?? ""} ${a.desc ?? ""} ${a.name}`; const raw = (a.condValue ?? "").trim() || (/(물고기|생선|어획)/.test(s) ? "생선" : /(채집|약초|나물)/.test(s) ? "채집" : null); if (!raw) return false; const alias = { 물고기: "생선", 어획물: "생선", 채집물: "채집", 약초: "채집" }; return (stats[`요리태그:${alias[raw] ?? raw}`] ?? 0) > 0; }
        case "대표배지장착": { const goal = n ?? 1; return goal <= 1 ? !!sheet.user.equippedBadge : prefixCnt("배지장착:") >= goal; }
        case "생활장비보유": return null; // 도구명 유추 — 수동
        case "모험가랭크": { const fromV = String(a.condValue ?? "").trim().toUpperCase(); const letter = RANK_ORDER[fromV] ? fromV : (a.id.match(/_rank_([dcbas])$/i)?.[1] ?? a.name.match(/([DCBAS])\s*랭크/i)?.[1] ?? "").toUpperCase(); return letter ? (RANK_ORDER[sheet.adventurerRank ?? "D"] ?? 0) >= (RANK_ORDER[letter] ?? 99) : false; }
        case "집등급": { const s = `${a.id} ${a.condValue ?? ""} ${a.desc ?? ""}`; const tier = /luxury|호화/.test(s) ? "luxury" : /standard|평범|아늑/.test(s) ? "standard" : /small|작은/.test(s) ? "small" : null; return tier ? houseMax >= TIER_ORDER[tier] : false; }
        case "길드등록": return true;
        case "집휴식횟수": case "의뢰완료횟수": {
          if (a.condType === "의뢰완료횟수") return n != null && Math.max(stats.의뢰완료횟수 ?? 0, stats.길드의뢰완료횟수 ?? 0) >= n;
          return n != null && (stats[a.condType] ?? 0) >= n;
        }
        default: return n != null ? (stats[a.condType] ?? 0) >= n : false;
      }
    };

    for (const a of achs) {
      const ok = evalOne(a);
      if (ok === null) { skippedTypes.add(a.condType); continue; }
      const has = earned.has(a.id);
      if (ok && !has) missed.push({ user: sheet.user.nickname, id: a.id, name: a.name, type: a.condType, val: a.condValue });
      if (!ok && has) over.push({ user: sheet.user.nickname, id: a.id, name: a.name, type: a.condType, val: a.condValue });
    }
  }

  console.log(`유저 ${users.length}명 × 업적 ${achs.length}개 감사`);
  console.log(`\n■ 조건 충족인데 미획득 (${missed.length}건)`);
  for (const m of missed) console.log(`  ${m.user} — [${m.id}] ${m.name} (${m.type}=${m.val ?? ""})`);
  console.log(`\n■ 미충족인데 획득됨 (${over.length}건) — 과거 오지급 or 스탯 유실`);
  for (const m of over) console.log(`  ${m.user} — [${m.id}] ${m.name} (${m.type}=${m.val ?? ""})`);
  console.log(`\n(감사 제외 유형: ${[...skippedTypes].join(", ") || "없음"})`);
  await prisma.$disconnect();
})().catch(e => { console.error("ERR:", e); process.exit(1); });
