// 생활스킬 등급 확률 셀프테스트. 실행: npm run lifeskill:selftest
// 정본 문서는 LIFESKILL_RATES.md — 숫자를 바꾸려면 문서와 여기를 같이 고친다.
//
// 여기서 지키는 것:
//   · 합계는 항상 100 (하위 등급이 고갈되는 극단값에서도)
//   · 행운을 올리면 3성이 '올라간다' (예전엔 0~3성 균등 차감이라 내려갔다)
//   · 4성은 Lv1~30 에서도 행운으로 열린다 (예전엔 영영 0%)
//   · 낚시·채집·채광이 같은 행운 규칙을 쓴다
import {
  adjustedRankWeights,
  baseWeightsFor,
  toolRankRateBonus,
  type LifeMods,
} from "../src/lib/lifeSkillPerks";

let passCount = 0;
let failCount = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${name}`);
    console.log(`        기대값: ${JSON.stringify(expected)}`);
    console.log(`        실제값: ${JSON.stringify(actual)}`);
  }
}

function mods(luck: number, extra: Partial<LifeMods> = {}): LifeMods {
  return {
    expMult: 1,
    goldMult: 1,
    luck,
    toolEff: 0,
    rank0Down: 0,
    rank1Down: 0,
    rank2Down: 0,
    rank5Up: 0,
    noTrash: false,
    gaugeSlow: 0,
    apCostDown: 0,
    doubleDrop: 0,
    ...extra,
  } as LifeMods;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rawWeightsAt = (kind: "낚시" | "채집" | "채광", level: number, m: LifeMods) =>
  adjustedRankWeights(m, baseWeightsFor(level, kind), level);
const weightsAt = (kind: "낚시" | "채집" | "채광", level: number, m: LifeMods) =>
  rawWeightsAt(kind, level, m).map(r2);
// 합계는 반올림 전 원본으로 잰다 — 자리별로 잘라서 더하면 99.99 같은 오차가 난다.
const isHundred = (w: number[]) => Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 1e-6;

console.log("== 1. 합계는 항상 100 ==");
{
  const broken: string[] = [];
  for (const kind of ["낚시", "채집", "채광"] as const) {
    for (const level of [1, 15, 30, 31, 45, 60, 61, 99]) {
      for (const luck of [0, 1, 10, 30, 60, 200]) {
        if (!isHundred(rawWeightsAt(kind, level, mods(luck)))) {
          broken.push(`${kind} Lv${level} 행운${luck}`);
        }
      }
    }
  }
  check("전 조합(3스킬 × 8레벨 × 6행운) 합계 100", broken, []);
}

console.log("== 2. 하위 등급 고갈·특성 병용에서도 합계 100 ==");
{
  check("행운 400 (Lv1 낚시)", isHundred(rawWeightsAt("낚시", 1, mods(400))), true);
  check("0성 제거 특성 + 행운 20", isHundred(rawWeightsAt("낚시", 1, mods(20, { noTrash: true }))), true);
  check(
    "운의 축적 3종 만렙 + 행운 60",
    isHundred(rawWeightsAt("낚시", 61, mods(60, { rank0Down: 10, rank1Down: 20, rank2Down: 20 }))),
    true,
  );
}

console.log("== 3. 행운을 올리면 3성이 올라간다 (내려가면 안 됨) ==");
{
  for (const kind of ["낚시", "채집", "채광"] as const) {
    const at = (luck: number) => weightsAt(kind, 15, mods(luck))[3];
    const rising = at(0) < at(10) && at(10) < at(30) && at(30) < at(60);
    check(`${kind} 3성 단조 증가`, rising, true);
  }
}

console.log("== 4. 4성은 Lv1~30 에서도 행운으로 열린다 ==");
{
  for (const kind of ["낚시", "채집", "채광"] as const) {
    check(`${kind} 행운 0 이면 4성 0`, weightsAt(kind, 15, mods(0))[4], 0);
    check(`${kind} 행운 10 이면 4성 0.5`, weightsAt(kind, 15, mods(10))[4], 0.5);
  }
}

console.log("== 5. 정본 표 — Lv1~30 낚시 ==");
{
  check("행운 0", weightsAt("낚시", 15, mods(0)), [27.2, 42, 25.7, 5.1, 0, 0]);
  check("행운 10", weightsAt("낚시", 15, mods(10)), [26.8, 41.6, 25.5, 5.6, 0.5, 0]);
  check("행운 30", weightsAt("낚시", 15, mods(30)), [26, 40.8, 25.1, 6.6, 1.5, 0]);
  check("행운 60", weightsAt("낚시", 15, mods(60)), [24.8, 39.6, 24.5, 8.1, 3, 0]);
}

console.log("== 6. 행운 1당 증감폭 (3·4성 +0.05 / 0·1·2성 -0.04·-0.04·-0.02) ==");
{
  const a = weightsAt("낚시", 15, mods(0));
  const b = weightsAt("낚시", 15, mods(100)); // 100배로 재서 반올림 오차 제거
  check("0성 -0.04/행운", r2((b[0] - a[0]) / 100), -0.04);
  check("1성 -0.04/행운", r2((b[1] - a[1]) / 100), -0.04);
  check("2성 -0.02/행운", r2((b[2] - a[2]) / 100), -0.02);
  check("3성 +0.05/행운", r2((b[3] - a[3]) / 100), 0.05);
  check("4성 +0.05/행운", r2((b[4] - a[4]) / 100), 0.05);
}

console.log("== 7. 세 스킬이 같은 행운 규칙을 쓴다 ==");
{
  const fourStar = (kind: "낚시" | "채집" | "채광") =>
    [1, 30, 31, 60, 61].map((lv) => weightsAt(kind, lv, mods(10))[4]);
  const expected = [0.5, 0.5, 1.9, 1.9, 6.5];
  check("낚시 4성 곡선", fourStar("낚시"), expected);
  check("채집 4성 곡선", fourStar("채집"), expected);
  check("채광 4성 곡선", fourStar("채광"), expected);
}

console.log("== 8. 생활 장비 + 숙련도 효율 ==");
{
  check("기본 도구는 숙련도가 무의미", [0, 40, 80].map((e) => toolRankRateBonus(0, e)), [0, 0, 0]);
  check("좋은 도구 (기본 2)", [0, 40, 80].map((e) => r2(toolRankRateBonus(1, e))), [2, 2.8, 3.6]);
  check("고급 도구 (기본 5)", [0, 40, 80].map((e) => r2(toolRankRateBonus(2, e))), [5, 7, 9]);
}

console.log("== 9. 누적 예시 (Lv15 낚시) ==");
{
  const step = (luck: number) => {
    const w = weightsAt("낚시", 15, mods(luck));
    return [w[3], w[4]];
  };
  check("행운 0", step(0), [5.1, 0]);
  check("행운 5 (스탯)", step(5), [5.35, 0.25]);
  check("행운 8 (+행운아 전설)", step(8), [5.5, 0.4]);
  check("행운 13 (+고급 낚싯대)", step(13), [5.75, 0.65]);
  check("행운 17 (+숙련 전설 80%)", step(17), [5.95, 0.85]);
  check("행운 19 (+요일 이벤트 2)", step(19), [6.05, 0.95]);
}

console.log("== 10. 레벨 구간 기본값 ==");
{
  check("Lv1~30 채광(보정 없음)", baseWeightsFor(15, "채광"), [30, 40, 25, 5, 0, 0]);
  check("Lv31~60 채광", baseWeightsFor(45, "채광"), [20, 35, 35, 9, 1, 0]);
  check("Lv61+ 채광", baseWeightsFor(99, "채광"), [10, 30, 30, 25, 4, 1]);
  check("낚시 보정 적용", baseWeightsFor(15, "낚시").map(r2), [27.2, 42, 25.7, 5.1, 0, 0]);
  check("채집 보정 적용", baseWeightsFor(15, "채집").map(r2), [27.1, 42, 25.8, 5.1, 0, 0]);
}

console.log(`
${passCount}개 통과, ${failCount}개 실패 (최종)`);
if (failCount > 0) process.exit(1);
