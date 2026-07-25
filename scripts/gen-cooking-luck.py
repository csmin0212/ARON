# -*- coding: utf-8 -*-
# 요리 레시피 재설계 — 생활 행운(낚시/채집/채광) 그리드 추가 + 중복 효과 정리.
# 입력: _recipes_now.csv (구글 시트 레시피 탭 gviz CSV)
# 출력: _recipes_new.csv (시트에 붙여넣을 전체 레시피)
#
# 규칙:
#  - 생활 행운 효과문은 "낚시 행운 +N" / "채집 행운 +N" / "채광 행운 +N"
#    / "낚시·채집 행운 +N" / "낚시·채집·채광 행운 +N" 형식(services.ts parseLifeLuck 매칭).
#  - 지속은 30분(코드상 행운 버프는 30분 고정, 지속칸은 표기용).
#  - 등급=증가량: R1→+1 ... R5→+5.
import csv, io, sys

SRC = "_recipes_now.csv"
OUT = "_recipes_new.csv"

# 기존 레시피 효과 덮어쓰기 (ID → 새 효과). 재료 테마에 맞춰 배정.
OVERRIDES = {
    # 낚시 행운 (생선 재료)
    "cook_mudfish_soup":            "낚시 행운 +1",   # 미꾸라지탕 R1 (구 행운+1)
    "cook_trout_sandwich":          "낚시 행운 +1",   # 송어 샌드위치 R1 (구 행운+1)
    "basic_fisher_snack":           "낚시 행운 +2",   # 낚시꾼 간식 R2 (구 행운+3)
    "cook_platinum_fish_pie":       "낚시 행운 +3",   # 백금어 파이 R3 (구 HP4D — 중복 회복 정리)
    "cook_waterdrop_sailfish_platter": "낚시 행운 +4",# 물망울 청새치 플래터 R4 (구 최대HP+15)
    # 채집 행운 (약초 재료)
    "cook_bellflower_tea":          "채집 행운 +1",   # 도라지 차 R1 (구 민첩+1 — 중복 정리)
    "cook_cheonrihyang_tea":        "채집 행운 +1",   # 천리향 꽃차 R1 (구 민첩+1 — 중복 정리)
    "cook_blue_rose_tea":           "채집 행운 +2",   # 푸른 장미 차 R2 (구 민첩+2)
    "cook_cordyceps_soup":          "채집 행운 +2",   # 동충하초 수프 R2 (구 회피+2)
    "cook_golden_firefly_cordial":  "채집 행운 +3",   # 황금 반딧풀 코디얼 R3 (구 행운+4)
    "cook_melinoa_spring_jelly":    "채집 행운 +4",   # 멜리노아 봄빛 젤리 R4 (구 감지+5)
    # 낚시·채집 행운 (생선+약초)
    "cook_kingfish_udumbara_sashimi": "낚시·채집 행운 +3", # 임금님고기 우담회 R3 (구 행운+4)
}
# 위 ID는 모두 지속을 30분으로 통일
LUCK_DURATION_IDS = set(OVERRIDES.keys())

# 신규 채광 행운 + 삼도(all) 레시피.
# 컬럼: id,name,category,rank,facility,ingredients,effect,duration,skillExp,tags,sellPrice,cost
NEW = [
    ("cook_miner_saltball",   "광부의 소금 주먹밥", "채광요리", "R1", "공용 주방",
     "고기x1, 밀x1, 소금x1",        "채광 행운 +1", "30분", 5,  "채광,행운", 63, 60),
    ("cook_pickaxe_porridge", "곡괭이 든든죽",       "채광요리", "R1", "공용 주방",
     "고기x1, 물x1, 소금x1",        "채광 행운 +1", "30분", 5,  "채광,행운", 48, 45),
    ("cook_smelter_steak",    "제련공 스테이크",     "채광요리", "R2", "조리대",
     "고기x1, 향신료x1, 소금x1",    "채광 행운 +2", "30분", 10, "채광,행운", 95, 90),
    ("cook_vein_scout_feast", "광맥 탐사가의 정찬",  "채광요리", "R3", "주방",
     "고기x1, 치즈x1, 달걀x1, 향신료x1", "채광 행운 +3", "30분", 18, "채광,행운", 140, 120),
    ("cook_blacksmith_banquet","대장장이의 만찬",    "채광요리", "R4", "고급 주방",
     "고기x2, 치즈x1, 향신료x1",    "채광 행운 +4", "30분", 26, "채광,행운", 200, 120),
    ("cook_triune_fortune_feast","삼도의 행운 성찬", "명품요리", "R4", "고급 주방",
     "배스x1, 산나물x1, 고기x1, 치즈x1", "낚시·채집·채광 행운 +4", "30분", 26, "낚시,채집,채광,행운", 220, 68),
]


def main():
    rows = list(csv.reader(io.open(SRC, encoding="utf-8")))
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}
    width = len(header)

    def col(name):
        return idx[name]

    out = [header]
    for r in rows[1:]:
        rid = r[col("레시피ID")]
        if rid in OVERRIDES:
            r = list(r)
            r[col("효과")] = OVERRIDES[rid]
            if rid in LUCK_DURATION_IDS:
                r[col("지속")] = "30분"
        out.append(r)

    # 신규 행 추가
    for (rid, name, cat, rank, fac, ing, eff, dur, exp, tags, sell, cost) in NEW:
        r = [""] * width
        r[col("레시피ID")] = rid
        r[col("이름")] = name
        r[col("분류")] = cat
        r[col("등급")] = rank
        r[col("필요시설")] = fac
        r[col("재료")] = ing
        r[col("결과")] = name
        r[col("효과")] = eff
        r[col("지속")] = dur
        r[col("숙련도")] = str(exp)
        r[col("태그")] = tags
        r[col("공개")] = "FALSE"
        r[col("판매가")] = str(sell)
        if "원가" in idx:
            r[col("원가")] = str(cost)
        if "이윤" in idx:
            r[col("이윤")] = str(sell - cost)
        if "이윤율" in idx:
            r[col("이윤율")] = f"{round((sell-cost)/cost*100,1)}%" if cost else ""
        out.append(r)

    with io.open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerows(out)

    print(f"wrote {OUT}: {len(out)-1} recipes (was {len(rows)-1}, +{len(NEW)} new)")

    # 검증: 모든 행운 효과문이 parseLifeLuck 정규식과 매칭되는지
    import re
    pat = re.compile(r"(?:낚시·채집·채광|낚시·채집|낚시|채집|채광)\s*행운\s*\+(\d+)")
    luck = 0
    bad = []
    for r in out[1:]:
        e = r[col("효과")]
        if "행운" in e:
            luck += 1
            if not pat.search(e):
                bad.append((r[col("이름")], e))
    print(f"luck recipes: {luck}")
    if bad:
        print("!! NOT MATCHING parseLifeLuck:", bad)
    else:
        print("all luck effects match parseLifeLuck ✓")


if __name__ == "__main__":
    main()
