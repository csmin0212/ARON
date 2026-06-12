export type LifeSkillKind = "채집" | "낚시";

export type LifeSkillItem = {
  no: number;
  name: string;
  rank: number;
  rarity: string;
  weight: number;
  price: number;
  exp: number;
  sizeBase: number;
  sizeVariance: number;
  text: string;
};

export type LifeSkillCatch = {
  kind: LifeSkillKind;
  item: LifeSkillItem;
  size: number;
};

const RANK_WEIGHTS = [
  { rank: 0, weight: 40 },
  { rank: 1, weight: 30 },
  { rank: 2, weight: 20 },
  { rank: 3, weight: 6 },
  { rank: 4, weight: 3 },
  { rank: 5, weight: 1 },
];

export const PLANT_ITEMS: LifeSkillItem[] = [
  { no: 1, name: "쐐기풀", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 1, sizeVariance: 1, rarity: "☆☆☆☆☆", text: "잎에 닿으면 따끔거린다. 딱히 쓸모는 없다." },
  { no: 2, name: "낙엽", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 20, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "나무에서 떨어진 나뭇잎. 땅에 수북히 있다." },
  { no: 3, name: "광대버섯", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 5, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "알록달록 예쁘지만, 독이 들어있다. 식용으로도 약용으로도 부적합하다." },
  { no: 4, name: "덩굴손", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "덩굴들이 얽히고 섥힌 것. 쓸모는 없다." },
  { no: 5, name: "쓰레기 더미", rank: 0, weight: 2, price: 0, exp: 1, sizeBase: 50, sizeVariance: 15, rarity: "☆☆☆☆☆", text: "당신의 봉사활동 정신에 감사를 표합니다. - 아카데미 환경미화부" },
  { no: 8, name: "겨우살이", rank: 1, weight: 1, price: 3, exp: 2, sizeBase: 10, sizeVariance: 20, rarity: "★☆☆☆☆", text: "나무에서 자라는 나무. 약용으로 많이 쓰인다." },
  { no: 9, name: "도라지", rank: 1, weight: 1, price: 7, exp: 3, sizeBase: 50, sizeVariance: 30, rarity: "★☆☆☆☆", text: "씹으면 단 맛과 함께 아린 맛이 난다. 호불호가 심한 식물." },
  { no: 10, name: "감초", rank: 1, weight: 1, price: 5, exp: 2, sizeBase: 20, sizeVariance: 70, rarity: "★☆☆☆☆", text: "영원히 주인공이 될 수 없는 비운의 약재" },
  { no: 11, name: "산나물", rank: 1, weight: 1, price: 8, exp: 2, sizeBase: 5, sizeVariance: 3, rarity: "★☆☆☆☆", text: "입에 넣고 씹으면 향긋함이 입 안을 가득 채운다." },
  { no: 12, name: "천리향", rank: 1, weight: 1, price: 5, exp: 4, sizeBase: 20, sizeVariance: 20, rarity: "★☆☆☆☆", text: "그 향기가 천 리 너머까지 퍼진다고 하여 천리향이라는 이름이 붙었다." },
  { no: 13, name: "영지버섯", rank: 1, weight: 2, price: 7, exp: 5, sizeBase: 150, sizeVariance: 50, rarity: "★☆☆☆☆", text: "그것은 버섯이라기엔 너무 컸다." },
  { no: 14, name: "은방울꽃", rank: 1, weight: 1, price: 5, exp: 3, sizeBase: 15, sizeVariance: 15, rarity: "★☆☆☆☆", text: "독성과 함께 미약한 마력을 품고 있다. 좋은 향이 난다." },
  { no: 15, name: "더덕", rank: 1, weight: 1, price: 4, exp: 6, sizeBase: 50, sizeVariance: 30, rarity: "★☆☆☆☆", text: "구워 먹으면 고기 맛이 난다. 더덕 잎은 산삼과 비슷하니 헷갈리지 않도록 하자." },
  { no: 16, name: "산딸기", rank: 1, weight: 1, price: 5, exp: 5, sizeBase: 60, sizeVariance: 20, rarity: "★☆☆☆☆", text: "상큼한 맛이 일품인 열매. 보통은 꿀이나 설탕에 절여서 먹는다." },
  { no: 43, name: "반딧풀", rank: 1, weight: 1, price: 10, exp: 15, sizeBase: 10, sizeVariance: 5, rarity: "★☆☆☆☆", text: "프레넬 숲에서 특별한 절기에만 채집할 수 있는 반짝이는 풀." },
  { no: 18, name: "산삼", rank: 2, weight: 1, price: 20, exp: 8, sizeBase: 70, sizeVariance: 15, rarity: "★★☆☆☆", text: "먹으면 기운이 솟는다. 물론, 마력이 회복되는 것은 아니라고." },
  { no: 19, name: "동충하초", rank: 2, weight: 1, price: 15, exp: 10, sizeBase: 8, sizeVariance: 2, rarity: "★★☆☆☆", text: "곤충의 몸에서 자라나는 희귀한 버섯. 사람의 몸에는 기생하지 않으니 안심해도 좋다." },
  { no: 20, name: "발광이끼", rank: 2, weight: 1, price: 12, exp: 8, sizeBase: 60, sizeVariance: 20, rarity: "★★☆☆☆", text: "어두운 곳에서 빛을 내는 이끼. 희미하게나마 마력을 품고 있다." },
  { no: 21, name: "하수오", rank: 2, weight: 2, price: 14, exp: 10, sizeBase: 100, sizeVariance: 30, rarity: "★★☆☆☆", text: "묵직하고 덩어리진 뿌리를 가진 약재. 소문에 따르면, 만년동안 묵은 하수오는 엄청난 마력을 품고 있다고 한다." },
  { no: 22, name: "백양초", rank: 2, weight: 1, price: 16, exp: 10, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "일년 내내 볕이 드는 곳에서만 자란다는 약초. 하급 포션의 촉매로 사용된다." },
  { no: 23, name: "푸른 장미", rank: 2, weight: 1, price: 18, exp: 5, sizeBase: 60, sizeVariance: 20, rarity: "★★☆☆☆", text: "푸른 꽃잎을 가진 장미. 꽃잎에 마력을 품고 있다." },
  { no: 39, name: "락 후르츠", rank: 2, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "바위처럼 단단한 껍질을 가진 열매. 껍질은 약재로, 과육은 식용으로 쓰인다. 부드러운 맛이 일품이다." },
  { no: 40, name: "오뎅 씨앗", rank: 2, weight: 1, price: 18, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "뭐? 오뎅을 심은 곳에서 오뎅이 자란다고? - 오늘 막 소환된 어션." },
  { no: 24, name: "우담바라", rank: 3, weight: 2, price: 30, exp: 70, sizeBase: 200, sizeVariance: 50, rarity: "★★★☆☆", text: "영력이 강하게 모이는 곳에서만 피어난다는 꽃. 마법 재료로 쓰인다." },
  { no: 25, name: "맨드레이크", rank: 3, weight: 1, price: 35, exp: 65, sizeBase: 20, sizeVariance: 50, rarity: "★★★☆☆", text: "야!!! 풀 짖는 소리 좀 안 나게 해라! - 어느 난폭한 시민." },
  { no: 26, name: "헤븐 베리", rank: 3, weight: 1, price: 28, exp: 50, sizeBase: 30, sizeVariance: 20, rarity: "★★★☆☆", text: "천국에서 맡을 수 있을 법한 달콤한 향을 풍기는 과실. 식도락가들 사이에서 비싼 값에 거래된다." },
  { no: 27, name: "마력이 깃든 나뭇가지", rank: 3, weight: 1, price: 26, exp: 55, sizeBase: 10, sizeVariance: 10, rarity: "★★★☆☆", text: "마력이 가득한 장소에 자라난 나무에서 채취한 나뭇가지. 매직 아이템의 재료로 많이 사용된다." },
  { no: 28, name: "유령손", rank: 3, weight: 1, price: 32, exp: 60, sizeBase: 80, sizeVariance: 30, rarity: "★★★☆☆", text: "유령의 손을 닮은 형태의 버섯. 달이 뜨지 않는 밤에만 자라난다." },
  { no: 41, name: "드래곤 플라워", rank: 3, weight: 1, price: 34, exp: 100, sizeBase: 80, sizeVariance: 30, rarity: "★★★☆☆", text: "드래곤이 입을 벌리고 있는 형상을 닮은 꽃. 강력한 마력을 품고 있다." },
  { no: 42, name: "황금 반딧풀", rank: 3, weight: 1, price: 60, exp: 300, sizeBase: 10, sizeVariance: 5, rarity: "★★★☆☆", text: "반딧풀 중에 굉장히 희소한 확률로 등장하는 황금빛 반딧풀, 굉장히 비싸게 팔린다." },
  { no: 44, name: "메리골드", rank: 3, weight: 1, price: 40, exp: 150, sizeBase: 10, sizeVariance: 5, rarity: "★★★☆☆", text: "언젠가 찾아올 행복. 노란 희망의 부름." },
  { no: 29, name: "멜리노아", rank: 4, weight: 1, price: 500, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "누가 가공하는지에 따라서 끔찍한 악몽도, 행복한 꿈도 꿀 수 있게 한다는 환상의 식물. 무슨 원리로 꿈을 조종할 수 있는지는 불명이다." },
  { no: 30, name: "마카리에", rank: 4, weight: 1, price: 500, exp: 1500, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "꿈조차 꾸지 못할 정도의 깊은 잠을 선사한다는 식물. 휴식이 간절히 필요한 사람만이 찾을 수 있다고 전해진다." },
  { no: 31, name: "스타더스트", rank: 4, weight: 1, price: 550, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "별이 비치는 고요한 수면 근처에서만 피어난다는 꽃. 빛의 마력을 품고 있어, 마법 재료로 사용된다." },
  { no: 32, name: "속삭임나무", rank: 4, weight: 2, price: 750, exp: 1500, sizeBase: 150, sizeVariance: 50, rarity: "★★★★☆", text: "무슨 소리야, 친구. 나무가 속삭일리가 없잖아. - 어느 베테랑 모험가." },
  { no: 33, name: "죽음의 나팔", rank: 4, weight: 1, price: 600, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "마력을 품은 동물의 사체 위에서만 자라나는 버섯. 어둠의 마력을 가득 품고 있어, 마법 재료로 사용된다." },
  { no: 45, name: "물망울 꽃", rank: 4, weight: 1, price: 1000, exp: 2000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "마력을 갖추어 물망울의 형태가 유지되는 꽃. 굉장히 보기 드물어 희소 재료가 되기도 한다." },
  { no: 34, name: "홍옥과", rank: 5, weight: 1, price: 3000, exp: 5000, sizeBase: 20, sizeVariance: 5, rarity: "★★★★★", text: "마치 붉은 보석과 같은 외형의 열매. 특정 나무에서 자라는 것이 아닌, 정령의 축복을 받은 열매가 홍옥과로 변하는 것이라는 연구 결과가 있다." },
  { no: 35, name: "휘드로시아", rank: 5, weight: 2, price: 3500, exp: 6000, sizeBase: 150, sizeVariance: 50, rarity: "★★★★★", text: "세상의 모든 원소와 성질을 담고 있다고 전해지는 전설의 식물. 어디서, 어떻게 채집해야 하는지조차 알려진 것이 없다." },
  { no: 36, name: "몰리", rank: 5, weight: 1, price: 3000, exp: 5000, sizeBase: 10, sizeVariance: 3, rarity: "★★★★★", text: "이승과 저승의 경계가 맞닿은 곳에서만 자란다는 꽃. 검은 뿌리와 하얀 꽃을 가지고 있다." },
  { no: 37, name: "에버스프링", rank: 5, weight: 1, price: 3000, exp: 5000, sizeBase: 10, sizeVariance: 3, rarity: "★★★★★", text: "아에마의 은혜를 듬뿍 받으며 자라나는 식물. 바구니 모양으로 엮인 잎에 담긴 이슬을 마시면, 하루동안 무한의 마력을 다룰 수 있다는 이야기가 전해진다." },
];

export const FISH_ITEMS: LifeSkillItem[] = [
  { no: 1, name: "쓰레기", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 1, sizeVariance: 1, rarity: "☆☆☆☆☆", text: "누가 강에 쓰레기를 버린거야? - 지나가는 아카데미생" },
  { no: 2, name: "헐어버린 장화", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 20, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "물 속에 오래 방치되었던 장화. 제 기능을 잃어버린 지 오래다." },
  { no: 3, name: "휴지조각", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 5, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "더럽다. 또한 더럽다." },
  { no: 4, name: "깨진 유리 조각", rank: 0, weight: 1, price: 0, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "날카롭다. 손이 베이지 않도록 조심하자." },
  { no: 5, name: "나무 판자", rank: 0, weight: 2, price: 0, exp: 1, sizeBase: 50, sizeVariance: 15, rarity: "☆☆☆☆☆", text: "무겁다. 어떻게 물고기와 착각할 수 있었는지 의문이 든다." },
  { no: 6, name: "붉은 파편", rank: 0, weight: 1, price: 5, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "물고기는 아니지만, 예쁘다." },
  { no: 7, name: "푸른 파편", rank: 0, weight: 1, price: 5, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "물고기는 아니지만, 예쁘다." },
  { no: 61, name: "찢어진 그물", rank: 0, weight: 1, price: 5, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "바다생물들에게 극도로 위험한 물건. 하나의 바다 친구를 살렸다고 생각하자." },
  { no: 43, name: "바닷빛 정수", rank: 0, weight: 1, price: 30, exp: 1, sizeBase: 3, sizeVariance: 5, rarity: "☆☆☆☆☆", text: "바다의 마력이 모인 정수. 거창한 이름에 비해 딱히 희귀하진 않다." },
  { no: 8, name: "블루길", rank: 1, weight: 1, price: 1, exp: 2, sizeBase: 10, sizeVariance: 20, rarity: "★☆☆☆☆", text: "아가미 옆의 푸른 점 때문에 블루길이라고 불린다." },
  { no: 9, name: "배스", rank: 1, weight: 1, price: 4, exp: 3, sizeBase: 50, sizeVariance: 30, rarity: "★☆☆☆☆", text: "어떤 사람은 이 생선으로 온갖 요리를 다 만들어 먹는다고 한다." },
  { no: 10, name: "잉어", rank: 1, weight: 1, price: 3, exp: 2, sizeBase: 20, sizeVariance: 70, rarity: "★☆☆☆☆", text: "명실상부 민물고기 요리의 왕. 보는 것만으로 침이 흐른다." },
  { no: 11, name: "미꾸라지", rank: 1, weight: 1, price: 3, exp: 2, sizeBase: 5, sizeVariance: 3, rarity: "★☆☆☆☆", text: "한 마리로 맑은 물을 충분히 흐릴 수 있다." },
  { no: 12, name: "송어", rank: 1, weight: 1, price: 3, exp: 4, sizeBase: 20, sizeVariance: 20, rarity: "★☆☆☆☆", text: "송송송, 송어 왔어요~" },
  { no: 13, name: "피루루크", rank: 1, weight: 2, price: 4, exp: 5, sizeBase: 150, sizeVariance: 50, rarity: "★☆☆☆☆", text: "이 정도 크기라면, 바다에서 사는 편이 행복할텐데. - 어떤 낚시꾼" },
  { no: 14, name: "준치", rank: 1, weight: 1, price: 2, exp: 3, sizeBase: 15, sizeVariance: 15, rarity: "★☆☆☆☆", text: "썩어도 이 녀석이다." },
  { no: 15, name: "향어", rank: 1, weight: 1, price: 4, exp: 3, sizeBase: 50, sizeVariance: 30, rarity: "★☆☆☆☆", text: "향어라고 해서 좋은 향이 나진 않는다." },
  { no: 16, name: "연어", rank: 1, weight: 1, price: 5, exp: 4, sizeBase: 60, sizeVariance: 20, rarity: "★☆☆☆☆", text: "흐르는 강물을 거꾸로 거슬러 오르는, 야들야들한 식감의 대표주자." },
  { no: 17, name: "틸라피아", rank: 1, weight: 1, price: 4, exp: 3, sizeBase: 50, sizeVariance: 30, rarity: "★☆☆☆☆", text: "먹지 마세요, 수조에 양보하세요." },
  { no: 42, name: "유황어", rank: 1, weight: 1, price: 10, exp: 5, sizeBase: 15, sizeVariance: 5, rarity: "★☆☆☆☆", text: "유황 성분을 먹고 자란다고 전해져 온천어라고도 불린다. 이걸 낚았다는건..." },
  { no: 18, name: "엔젤피쉬", rank: 2, weight: 1, price: 8, exp: 8, sizeBase: 70, sizeVariance: 15, rarity: "★★☆☆☆", text: "직각삼각형에서 빗변의 길이의 제곱은 나머지 두 변의 길이를 제곱한 뒤 더한 것과 같다." },
  { no: 19, name: "금박가재", rank: 2, weight: 1, price: 9, exp: 10, sizeBase: 8, sizeVariance: 2, rarity: "★★☆☆☆", text: "집게발이 금박을 입힌 것처럼 금빛을 띄고 있다고 하여 붙여진 이름. 탱탱한 살이 일품이다." },
  { no: 20, name: "꽃잎 메기", rank: 2, weight: 1, price: 13, exp: 8, sizeBase: 60, sizeVariance: 20, rarity: "★★☆☆☆", text: "위에서 보면 마치 꽃잎을 닮은 형태를 띄고 있다. 정면에서 보면 자세한 설명은 생략한다." },
  { no: 21, name: "아로와나", rank: 2, weight: 2, price: 10, exp: 10, sizeBase: 100, sizeVariance: 30, rarity: "★★☆☆☆", text: "대체 어떻게 민물에서 살고 있는 건지 의문이 들 정도로 크다." },
  { no: 22, name: "산천어", rank: 2, weight: 1, price: 7, exp: 10, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "뭐? 2급수? 안 해, 안 해. 나 죽어버릴거야." },
  { no: 23, name: "슬라임 잭", rank: 2, weight: 1, price: 11, exp: 5, sizeBase: 60, sizeVariance: 20, rarity: "★★☆☆☆", text: "말랑말랑, 만지면 기분이 좋다. 특정 매니아들 사이에서 인기가 많다." },
  { no: 39, name: "안개정어리", rank: 2, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "흐물흐물거릴 정도로 뼈가 얇아 지어진 이름의 물고기, 톡 쏘는 맛이 별미이다." },
  { no: 40, name: "녹쏘가리", rank: 2, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "프레넬 숲에서만 나온다고 전해지는 녹색 쏘가리, 생긴 것과 달리 맛있다." },
  { no: 44, name: "정어리", rank: 2, weight: 1, price: 25, exp: 30, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "바다의 쌀이라고 불리는 생선. 그 이름에 걸맞게, 작은 덩치에 비해 영양소가 풍부하다." },
  { no: 45, name: "멸치", rank: 2, weight: 1, price: 30, exp: 45, sizeBase: 60, sizeVariance: 10, rarity: "★★☆☆☆", text: "우리 아이 술안주, 아빠의 영양간식. 그렇다면 엄마는?" },
  { no: 24, name: "골리앗피쉬", rank: 3, weight: 2, price: 20, exp: 70, sizeBase: 200, sizeVariance: 50, rarity: "★★★☆☆", text: "이름도 크기도 골리앗!" },
  { no: 25, name: "고드름 잉어", rank: 3, weight: 1, price: 20, exp: 65, sizeBase: 20, sizeVariance: 50, rarity: "★★★☆☆", text: "머리 한 가운데에 고드름 모양의 뿔이 돋아있는 희귀종. 뿔에서는 은은한 냉기가 감돈다." },
  { no: 26, name: "파이렐투스", rank: 3, weight: 1, price: 25, exp: 50, sizeBase: 30, sizeVariance: 20, rarity: "★★★☆☆", text: "태양을 닮은 따스한 주홍빛 비늘이 반짝인다." },
  { no: 27, name: "백금어", rank: 3, weight: 1, price: 25, exp: 55, sizeBase: 10, sizeVariance: 10, rarity: "★★★☆☆", text: "백금을 씌운 듯, 아름다운 비늘로 덮힌 물고기." },
  { no: 28, name: "루비 스타", rank: 3, weight: 1, price: 25, exp: 60, sizeBase: 80, sizeVariance: 30, rarity: "★★★☆☆", text: "루비색의 별 모양 진주를 품은 조개. 품질이 좋은 진주는 사치가들에게 대인기." },
  { no: 41, name: "역천어", rank: 3, weight: 1, price: 30, exp: 100, sizeBase: 80, sizeVariance: 30, rarity: "★★★☆☆", text: "끊임없이 강을 역류하며 올라가는 물고기, 힘이 대단히 좋다." },
  { no: 46, name: "문어", rank: 3, weight: 1, price: 50, exp: 80, sizeBase: 60, sizeVariance: 10, rarity: "★★★☆☆", text: "문어님 문어님, 올해는 축구부가 우승할 수 있을까요?" },
  { no: 47, name: "광어", rank: 3, weight: 1, price: 75, exp: 120, sizeBase: 60, sizeVariance: 10, rarity: "★★★☆☆", text: "넙데데한 모습 때문에 넙치라고도 불린다. 회를 떠서 먹으면 맛이 굉장히 훌륭하다." },
  { no: 48, name: "참돔", rank: 3, weight: 1, price: 60, exp: 100, sizeBase: 60, sizeVariance: 10, rarity: "★★★☆☆", text: "회로 떠서 먹으면 기름진 맛이 일품이다. 그랑펠덴에서도 인기 횟감." },
  { no: 49, name: "개복치", rank: 3, weight: 3, price: 100, exp: 150, sizeBase: 60, sizeVariance: 10, rarity: "★★★☆☆", text: "툭하면 죽는 그 생선을 생각했다면, 엄청난 덩치와 마주하게 될 것이다." },
  { no: 29, name: "겨울나기", rank: 4, weight: 1, price: 500, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "겨울 중 가장 추운 날에만 발견할 수 있다는 환상의 물고기. 강력한 물의 원소를 품고 있는 귀한 마법 재료라서, 부르는 것이 값이다." },
  { no: 30, name: "강의 심부름꾼", rank: 4, weight: 2, price: 750, exp: 1500, sizeBase: 150, sizeVariance: 50, rarity: "★★★★☆", text: "마치 용을 닮은 생김새와 남색 비늘을 두른 물고기. 그 신비스러운 모습에, 강신의 심부름꾼으로 불린다." },
  { no: 31, name: "봄빛 전령", rank: 4, weight: 1, price: 450, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "봄빛이라고밖에 표현할 수 없는 빛을 두른 작은 물고기. 발견한 사람은, 그 해에 행운이 깃든다는 설이 있다." },
  { no: 32, name: "가을비늘", rank: 4, weight: 1, price: 400, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "구름 한 점 없는 가을 날의 강에서만 보인다는 물고기. 단풍잎 모양의 붉은 비늘이 인상적이다." },
  { no: 33, name: "여름길잡이", rank: 4, weight: 1, price: 550, exp: 1000, sizeBase: 80, sizeVariance: 20, rarity: "★★★★☆", text: "내가 봤다니까. 여름에 강에서 놀다가 길을 잃었는데, 어떤 파란색 물고기가 길을 안내해줬다고! - 허풍이 심한 아카데미생." },
  { no: 50, name: "참치", rank: 4, weight: 2, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★☆", text: "값비싼 회의 대명사. 덩치에 걸맞게 힘도 강하다." },
  { no: 51, name: "청새치", rank: 4, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★☆", text: "으악! 생선이 날 찔렀어! 메딕, 메딕!!!" },
  { no: 52, name: "밀레니엄 크랩", rank: 4, weight: 3, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★☆", text: "수명이 1000년을 넘는다고 알려진 희귀한 갑각류. 크랩이라는 이름과 달리, 실제로는 바닷가재와 비슷하게 생겼다." },
  { no: 53, name: "혼불아귀", rank: 4, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★☆", text: "푸르스름하고, 스산한 빛을 발산하는 아귀. 유령선과 함께 출몰한다는 이야기가 전해진다." },
  { no: 54, name: "오레이칼", rank: 4, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★☆", text: "전신이 엄청난 강도의 금속질 비늘로 덮혀있는 물고기. 그 생태는 아직도 미궁에 빠져있다." },
  { no: 34, name: "빛바랜 추억", rank: 5, weight: 1, price: 2000, exp: 3000, sizeBase: 20, sizeVariance: 5, rarity: "★★★★★", text: "모든 추억은 시간의 흐름 앞에서 빛을 잃고, 잊혀지기 마련. 허나, 그 과정조차 아름답기에, 추억이라 불린다. - 신원 미상의 철학자." },
  { no: 35, name: "호수의 주인", rank: 5, weight: 2, price: 2500, exp: 4000, sizeBase: 150, sizeVariance: 50, rarity: "★★★★★", text: "에첸의 숲 호수에 산다고 전해지는 전설적인 존재. 거대하다는 것 외에는 알려진 특징이 없다." },
  { no: 36, name: "태양아가미", rank: 5, weight: 1, price: 2000, exp: 3000, sizeBase: 10, sizeVariance: 3, rarity: "★★★★★", text: "아켄라브의 축복을 듬뿍 받은, 전설의 물고기. 강렬한 열기와 눈부신 광휘가 느껴진다면, 그것과 조우한 것이다." },
  { no: 37, name: "달지느러미", rank: 5, weight: 1, price: 2000, exp: 3000, sizeBase: 10, sizeVariance: 3, rarity: "★★★★★", text: "브리간티아의 가호를 받는 물고기. 그 존재를 한 번 목격한 것만으로, 조금 앞의 미래를 내다볼 수 있게 된다고 전해진다." },
  { no: 55, name: "기갈로돈", rank: 5, weight: 3, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★★", text: "고대에 이미 멸종했다고 전해지는, 굉장히 거대한 상어. 작은 배와 비슷한 크기를 지녔다." },
  { no: 56, name: "백경", rank: 5, weight: 10, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★★", text: "구전동화에서나 그 존재를 유추할 수 있는 전설의 고래. 순백의 거체를 목격한 순간, 경외할 수밖에 없다고 전해진다." },
  { no: 57, name: "금강비늘", rank: 5, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★★", text: "야장의 신 고바논의 권능을 받아, 그 몸을 금강석과 같은 재질의 비늘로 감싼 물고기. 일반적인 인간의 근력으로는 감당할 수 없는 활력을 지니고 있다." },
  { no: 58, name: "바다의 전령", rank: 5, weight: 3, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★★", text: "용의 형상을 띈 거체와, 바다의 빛을 전부 담아낸 이 비늘의 빛. 그야말로 전설의 물고기라 칭하기에 부족함이 없도다! - 어떤 어류학자." },
  { no: 59, name: "쉔 우", rank: 5, weight: 1, price: 15, exp: 15, sizeBase: 60, sizeVariance: 10, rarity: "★★★★★", text: "용의 머리와 뱀의 꼬리, 거북이의 껍질을 지니고, 음기를 조종한다는 환수종. 주로 에린딜 동방의 설화에서 자주 등장한다." },
  { no: 60, name: "크라켄", rank: 5, weight: 6, price: 15, exp: 15, sizeBase: 600, sizeVariance: 10, rarity: "★★★★★", text: "얘는 전투해야 잡을 수 있게 설계할거에요 - 뭇별" },
];

function rollInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function pickRank(): number {
  const total = RANK_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of RANK_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.rank;
  }
  return RANK_WEIGHTS[RANK_WEIGHTS.length - 1].rank;
}

function poolFor(kind: LifeSkillKind): LifeSkillItem[] {
  return kind === "채집" ? PLANT_ITEMS : FISH_ITEMS;
}

export function lifeSkillKindOf(kind: string, label?: string | null): LifeSkillKind | null {
  const source = `${kind} ${label ?? ""}`.replace(/\s+/g, "");
  if (source.includes("채집") || source.includes("약초")) return "채집";
  if (source.includes("낚시") || source.includes("어업")) return "낚시";
  return null;
}

export function pickLifeSkillCatch(kind: LifeSkillKind): LifeSkillCatch {
  const pool = poolFor(kind);
  const rank = pickRank();
  const rankPool = pool.filter((item) => item.rank === rank);
  const candidates = rankPool.length > 0 ? rankPool : pool;
  const item = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    kind,
    item,
    size: item.sizeBase + rollInt(item.sizeVariance),
  };
}

export function lifeSkillItemEffect(item: LifeSkillItem): string {
  return [
    `희귀도 ${item.rarity}`,
    `판매가 ${item.price}G · 숙련도 ${item.exp}`,
    item.text,
  ].join("\n");
}

export function lifeSkillCategory(kind: LifeSkillKind): string {
  return kind === "채집" ? "채집품" : "어획물";
}
