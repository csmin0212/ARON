import { PrismaClient } from "../src/generated/prisma/index.js";
import { writeFileSync } from "node:fs";
const prisma = new PrismaClient();
const esc=v=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
const toCsv=rows=>"﻿"+rows.map(r=>r.map(esc).join(",")).join("\r\n")+"\r\n";

// ── 신규 재료 6종 (수/지/풍/광 특화 + 수/지 내성) ──
const ITEMS=[
  {id:"청옥물방울",name:"청옥 물방울",cat:"재료",sell:150,eff:"공격력+1, [수속성 특화]",desc:"지하호수 종유석 끝에 오래 맺혀 굳은 푸른 물방울. 차가운 물의 기운이 응결되어 있다."},
  {id:"여명결정",name:"여명의 결정",cat:"재료",sell:150,eff:"명중+1, [광속성 특화]",desc:"지하호수 천장에서 홀로 빛나던 결정. 어둠 속에서도 스스로 빛을 낸다."},
  {id:"질풍깃털",name:"질풍의 깃털",cat:"재료",sell:150,eff:"명중+1, [풍속성 특화]",desc:"협곡의 상승기류를 가르던 깃털. 쥐면 바람의 결이 손끝을 감는다."},
  {id:"대지심장석",name:"대지의 심장석",cat:"재료",sell:150,eff:"공격력+1, [지속성 특화]",desc:"바람협곡 바위 속에 박혀 있던 갈색 결정. 대지의 무게가 실려 있다."},
  {id:"이무기비늘",name:"이무기의 비늘",cat:"재료",sell:180,eff:"마방+2, [수속성 내성]",desc:"호수 깊은 곳 이무기가 벗어둔 비늘. 물의 냉기를 흘려낸다."},
  {id:"산울림돌",name:"산울림 돌",cat:"재료",sell:180,eff:"물방+2, [지속성 내성]",desc:"협곡을 굴러 둥글어진 돌. 두드리면 산이 울리듯 단단하다."},
];
const itemCsv=[["ID","이름","분류","구매가","판매가","제작효과","설명"]];
for(const it of ITEMS){ itemCsv.push([it.id,it.name,it.cat,"",it.sell,it.eff,it.desc]);
  await prisma.item.upsert({ where:{id:it.id}, create:{id:it.id,name:it.name,category:it.cat,sellPrice:it.sell,craftEffect:it.eff,desc:it.desc}, update:{name:it.name,category:it.cat,sellPrice:it.sell,craftEffect:it.eff,desc:it.desc} });
}
writeFileSync("C:/Users/joy64/ARON/아이템탭_속성재료추가.csv", toCsv(itemCsv));
console.log(`아이템탭_속성재료추가.csv — ${ITEMS.length}종 (DB 반영 완료)`);

// ── 신규 던전 2곳 (비히든 1층) ──
const roll=arr=>arr.map(([item,gold,weight,qty])=>({item,qty:qty??1,gold:gold??0,weight}));
const DUNGEONS=[
  { id:"지하호수동_하", name:"지하호수 수정동", loc:"지하호수", dc:0, exp:4, expMax:5,
    drops:[{item:"MP 포션",qty:1,gold:0,weight:1}],
    roll:roll([["청옥 물방울",0,22],["여명의 결정",0,18],["이무기의 비늘",0,15],["사파이어",0,15],["골드",150,30,0]]),
    rollSpec:"청옥 물방울:22, 여명의 결정:18, 이무기의 비늘:15, 사파이어:15, 골드x150:30" },
  { id:"바람협곡굴_하", name:"바람협곡 바위굴", loc:"바람협곡", dc:0, exp:4, expMax:5,
    drops:[{item:"HP 포션",qty:1,gold:0,weight:1}],
    roll:roll([["질풍의 깃털",0,22],["대지의 심장석",0,18],["산울림 돌",0,15],["토파즈",0,15],["골드",150,30,0]]),
    rollSpec:"질풍의 깃털:22, 대지의 심장석:18, 산울림 돌:15, 토파즈:15, 골드x150:30" },
];
// 보상 아이템이 DB에 있는지 검증
const allNames=new Set((await prisma.item.findMany({select:{name:true}})).map(i=>i.name));
for(const d of DUNGEONS){ for(const r of d.roll){ if(r.item!=="골드"&&r.item!=="꽝"&&!allNames.has(r.item)) throw new Error(`던전 ${d.id} 보상 '${r.item}' 아이템 없음`); } }
const dgCsv=[["던전ID","이름","장소","달성치","경험점","확정보상","확률보상","층"]];
let order=100;
for(const d of DUNGEONS){
  dgCsv.push([d.id,d.name,d.loc,d.dc,`${d.exp}~${d.expMax}`,d.drops.map(x=>`${x.item}${x.qty>1?`x${x.qty}`:""}`).join(", "),d.rollSpec,"1"]);
  await prisma.dungeon.upsert({ where:{id:d.id},
    create:{id:d.id,name:d.name,locationId:d.loc,dc:d.dc,exp:d.exp,expMax:d.expMax,dropsJson:JSON.stringify(d.drops),rollDropsJson:JSON.stringify(d.roll),floor:1,order:order++},
    update:{name:d.name,locationId:d.loc,dc:d.dc,exp:d.exp,expMax:d.expMax,dropsJson:JSON.stringify(d.drops),rollDropsJson:JSON.stringify(d.roll),floor:1} });
}
writeFileSync("C:/Users/joy64/ARON/던전탭_추가.csv", toCsv(dgCsv));
console.log(`던전탭_추가.csv — ${DUNGEONS.length}곳 @지하호수·바람협곡 (DB 반영 완료)`);
await prisma.$disconnect();
