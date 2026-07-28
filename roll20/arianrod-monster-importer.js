/*
 * Arianrod Monster Importer for Roll20 API
 *
 * Roll20 Pro API Script에 붙여넣어 사용합니다.
 *
 * Commands:
 *   !ar-monster help
 *   !ar-monster list
 *   !ar-monster import <id-or-name>
 *   !ar-monster import-all
 *   !ar-monster handout <handout name>
 *   !ar-monster clear-handout
 *
 * 이미지까지 넣는 법:
 *   1. 이미지 URL이 있으면 데이터의 imgsrc에 넣습니다.
 *   2. 또는 Roll20 캔버스에 이미지를 토큰으로 올려둔 뒤 그 토큰을 선택하고 import를 실행합니다.
 *      선택한 토큰은 생성된 캐릭터에 연결되고 기본 토큰으로 저장됩니다.
 */

var ArianrodMonsterImporter = ArianrodMonsterImporter || (function () {
  "use strict";

  var VERSION = "0.1.0";
  var STATE_KEY = "ArianrodMonsterImporter";

  var AR_MONSTER_DATA = [
    {
      id: "gilman-magician",
      name: "길맨 매지션",
      imgsrc: "",
      category: "동물(길맨)",
      element: "수",
      level: 4,
      identify: 11,
      hp: 56,
      mp: 58,
      judge: "",
      defense: { physical: 8, magical: 4 },
      combat: {
        evasion: "4(2D)",
        action: 9,
        move: 7
      },
      stats: {
        strength: "8/2",
        dexterity: "5/1",
        agility: "14/4",
        intelligence: "15/5",
        perception: "15/5",
        mind: "10/3",
        luck: "15/5"
      },
      attacks: [
        {
          label: "공격 A",
          name: "스태프",
          kind: "타격/양손",
          hit: "2(2D)",
          damage: "8(2D)",
          damageType: "백병(물리)",
          range: "지근"
        },
        {
          label: "공격 B",
          name: "<마술 공격:물>",
          kind: "마법(물)",
          hit: "18(3D)",
          damage: "22(2D)",
          damageType: "마법(물)",
          range: "20m"
        }
      ],
      skills: [
        "<배드 스테이터스 부여:방심> 1",
        "<길맨 영법> 1"
      ],
      drops: [
        { range: "6~8", name: "길맨의 지느러미", price: 10, count: 3 },
        { range: "9~12", name: "길맨의 비늘", price: 20, count: 3 },
        { range: "13~", name: "길맨의 윗 지느러미", price: 100, count: 2 }
      ],
      description:
        "길맨 중에서도 꽤 똑똑한 길맨. 물의 마술을 다루지만, 육체를 이용한 행동은 서툴고 매우 잘 맞지 않는다.\n\n" +
        "이를 위해 길맨 아처 등과 마찬가지로 후방에서 지원한다. 마술을 습득하기 전까진 무리에서 거친거리며 관계를 가지고자 또다른 소문이 있었다. " +
        "그러나 마법을 습득한 후에는 무리의 우두머리를 보좌하거나 작은 무리의 우두머리가 되는 등 크게 출세하기도 한다.\n\n" +
        "평소 물속에서 생활해서 그런지 아니면 길맨 때문에 물과의 궁합이 잘 맞아서 그런지 물 속성 이외의 마법을 다루는 사람은 별로 없다. " +
        "만약 고수 속성 이외의 마법을 사용하는 길맨을 만났다면 상당한 노력을 기울이고 있다고 생각해도 좋을지도 모른다."
    }
  ];

  function initState() {
    state[STATE_KEY] = state[STATE_KEY] || {};
    state[STATE_KEY].monsters = state[STATE_KEY].monsters || {};
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function whisper(who, html) {
    sendChat("AR Importer", "/w " + who + " " + html);
  }

  function gmWhisper(html) {
    sendChat("AR Importer", "/w gm " + html);
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^\w가-힣-]/g, "");
  }

  function getAllMonsters() {
    var out = {};
    var i;
    for (i = 0; i < AR_MONSTER_DATA.length; i += 1) {
      out[AR_MONSTER_DATA[i].id] = AR_MONSTER_DATA[i];
    }
    var custom = (state[STATE_KEY] && state[STATE_KEY].monsters) || {};
    Object.keys(custom).forEach(function (key) {
      out[key] = custom[key];
    });
    return out;
  }

  function findMonster(query) {
    var all = getAllMonsters();
    var key;
    var q = slug(query);
    if (all[query]) return all[query];
    for (key in all) {
      if (!all.hasOwnProperty(key)) continue;
      if (slug(key) === q || slug(all[key].name) === q) return all[key];
    }
    return null;
  }

  function findOrCreateCharacter(name) {
    var character = findObjs({ _type: "character", name: name })[0];
    if (character) return character;
    return createObj("character", { name: name });
  }

  function setAttr(characterId, name, current, max) {
    var attr = findObjs({ _type: "attribute", _characterid: characterId, name: name })[0];
    var data = {
      name: name,
      current: current == null ? "" : String(current)
    };
    if (max != null) data.max = String(max);
    if (attr) {
      attr.set(data);
      return attr;
    }
    data._characterid = characterId;
    return createObj("attribute", data);
  }

  function setAbility(characterId, name, action, tokenAction) {
    var ability = findObjs({ _type: "ability", _characterid: characterId, name: name })[0];
    var data = {
      name: name,
      action: action,
      istokenaction: tokenAction ? true : false
    };
    if (ability) {
      ability.set(data);
      return ability;
    }
    data._characterid = characterId;
    return createObj("ability", data);
  }

  function rollExpr(raw) {
    var text = String(raw == null ? "" : raw).replace(/\s+/g, "");
    var match = text.match(/^(-?\d+)\((\d+)D\)$/i);
    if (match) {
      return match[2] + "d6" + (Number(match[1]) >= 0 ? "+" : "") + match[1];
    }
    return text || "0";
  }

  function field(label, value) {
    if (value == null || value === "") return "";
    return "{{" + label + "=" + value + "}} ";
  }

  function attackAbility(monster, attack) {
    return "&{template:default} " +
      "{{name=@{character_name} - " + attack.label + ": " + attack.name + "}} " +
      field("종류", attack.kind) +
      field("명중", "[[" + rollExpr(attack.hit) + "]]") +
      field("대미지", "[[" + rollExpr(attack.damage) + "]]") +
      field("피해", attack.damageType) +
      field("사거리", attack.range);
  }

  function infoAbility(monster) {
    return "&{template:default} " +
      "{{name=@{character_name}}} " +
      field("분류", monster.category) +
      field("속성", monster.element) +
      field("레벨", monster.level) +
      field("식별값", monster.identify) +
      field("HP", monster.hp) +
      field("MP", monster.mp) +
      field("방어", (monster.defense ? monster.defense.physical + "/" + monster.defense.magical : "")) +
      field("회피", monster.combat && monster.combat.evasion) +
      field("행동치", monster.combat && monster.combat.action) +
      field("이동력", monster.combat && monster.combat.move);
  }

  function skillsAbility(monster) {
    var skills = monster.skills || [];
    return "&{template:default} {{name=@{character_name} - 에너미 스킬}} {{스킬=" + esc(skills.join("\n")) + "}}";
  }

  function dropsAbility(monster) {
    var drops = monster.drops || [];
    var text = drops.map(function (drop) {
      return drop.range + " : " + drop.name + " / " + drop.price + "G / " + drop.count + "개";
    }).join("\n");
    return "&{template:default} {{name=@{character_name} - 드롭 아이템}} {{달성치=[[1d20]]}} {{표=" + esc(text) + "}}";
  }

  function compactHtml(monster) {
    var rows = [];
    rows.push("<h3>" + esc(monster.name) + "</h3>");
    rows.push("<p><b>분류</b> " + esc(monster.category) + " / <b>속성</b> " + esc(monster.element) + " / <b>Lv</b> " + esc(monster.level) + "</p>");
    rows.push("<p><b>식별값</b> " + esc(monster.identify) + " / <b>HP</b> " + esc(monster.hp) + " / <b>MP</b> " + esc(monster.mp) + "</p>");
    if (monster.defense) rows.push("<p><b>방어</b> " + esc(monster.defense.physical) + "/" + esc(monster.defense.magical) + "</p>");
    if (monster.description) rows.push("<hr><p>" + esc(monster.description).replace(/\n/g, "<br>") + "</p>");
    return rows.join("");
  }

  function normalizeImgsrc(src) {
    if (!src) return "";
    return String(src)
      .replace(/\/(max|med|original|thumb)\./, "/thumb.")
      .replace(/\?(.*)$/, "");
  }

  function selectedGraphic(msg) {
    if (!msg.selected || msg.selected.length !== 1) return null;
    if (msg.selected[0]._type !== "graphic") return null;
    return getObj("graphic", msg.selected[0]._id);
  }

  function createOrUpdateToken(msg, character, monster, hpAttr, mpAttr) {
    var token = selectedGraphic(msg);
    var pageId = token ? token.get("_pageid") : Campaign().get("playerpageid");
    var imgsrc = normalizeImgsrc(monster.imgsrc || (token && token.get("imgsrc")));
    if (!token && !imgsrc) return null;

    if (!token) {
      token = createObj("graphic", {
        _pageid: pageId,
        layer: "objects",
        imgsrc: imgsrc,
        name: monster.name,
        left: 420,
        top: 420,
        width: 70,
        height: 70
      });
    }

    token.set({
      name: monster.name,
      represents: character.id,
      showname: true,
      bar1_value: monster.hp,
      bar1_max: monster.hp,
      bar1_link: hpAttr ? hpAttr.id : "",
      bar2_value: monster.mp,
      bar2_max: monster.mp,
      bar2_link: mpAttr ? mpAttr.id : ""
    });

    try {
      if (typeof setDefaultTokenForCharacter === "function") {
        setDefaultTokenForCharacter(character, token);
      }
    } catch (e) {
      log("ArianrodMonsterImporter default token failed: " + e.message);
    }

    return token;
  }

  function importMonster(monster, msg, options) {
    options = options || {};
    var character = findOrCreateCharacter(monster.name);
    var characterId = character.id;
    var hpAttr;
    var mpAttr;
    var i;

    character.set({
      archived: false,
      inplayerjournals: "",
      controlledby: ""
    });

    hpAttr = setAttr(characterId, "hp", monster.hp, monster.hp);
    mpAttr = setAttr(characterId, "mp", monster.mp, monster.mp);
    setAttr(characterId, "level", monster.level);
    setAttr(characterId, "category", monster.category);
    setAttr(characterId, "element", monster.element);
    setAttr(characterId, "identify", monster.identify);
    setAttr(characterId, "physical_defense", monster.defense && monster.defense.physical);
    setAttr(characterId, "magic_defense", monster.defense && monster.defense.magical);
    setAttr(characterId, "evasion", monster.combat && monster.combat.evasion);
    setAttr(characterId, "action", monster.combat && monster.combat.action);
    setAttr(characterId, "move", monster.combat && monster.combat.move);

    if (monster.stats) {
      Object.keys(monster.stats).forEach(function (key) {
        setAttr(characterId, key, monster.stats[key]);
      });
    }

    setAbility(characterId, "정보", infoAbility(monster), true);
    for (i = 0; i < (monster.attacks || []).length; i += 1) {
      setAbility(characterId, monster.attacks[i].label, attackAbility(monster, monster.attacks[i]), true);
    }
    setAbility(characterId, "스킬", skillsAbility(monster), true);
    setAbility(characterId, "드롭", dropsAbility(monster), true);

    character.set("gmnotes", compactHtml(monster));
    character.set("bio", compactHtml(monster));

    if (!options.noToken) createOrUpdateToken(msg, character, monster, hpAttr, mpAttr);

    return character;
  }

  function renderList() {
    var all = getAllMonsters();
    var keys = Object.keys(all).sort();
    if (!keys.length) return "<div>등록된 몬스터가 없습니다.</div>";
    return keys.map(function (key) {
      var monster = all[key];
      return "<div><b>" + esc(monster.name) + "</b> <code>" + esc(key) + "</code> " +
        "<a href=\"!ar-monster import " + esc(key) + "\">생성</a></div>";
    }).join("");
  }

  function help() {
    return [
      "<div style='border:1px solid #aaa;background:#fff;padding:8px'>",
      "<h3>Arianrod Monster Importer v" + VERSION + "</h3>",
      "<p><code>!ar-monster list</code> : 등록된 몬스터 목록</p>",
      "<p><code>!ar-monster import gilman-magician</code> : 캐릭터/토큰 생성</p>",
      "<p><code>!ar-monster import-all</code> : 모든 몬스터 캐릭터 생성</p>",
      "<p><code>!ar-monster handout 몬스터데이터</code> : 핸드아웃 notes의 JSON 배열을 불러오기</p>",
      "<p>이미지를 캔버스에 올려 선택한 뒤 import하면 그 이미지가 기본 토큰이 됩니다.</p>",
      "</div>"
    ].join("");
  }

  function loadHandout(name) {
    var handout = findObjs({ _type: "handout", name: name })[0];
    if (!handout) {
      gmWhisper("핸드아웃을 찾지 못했어요: <b>" + esc(name) + "</b>");
      return;
    }
    handout.get("notes", function (notes) {
      var text = String(notes || "").replace(/<[^>]*>/g, "").trim();
      var parsed;
      var i;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        gmWhisper("JSON 파싱 실패: " + esc(e.message));
        return;
      }
      if (!Array.isArray(parsed)) {
        gmWhisper("핸드아웃 JSON은 몬스터 배열이어야 해요.");
        return;
      }
      initState();
      for (i = 0; i < parsed.length; i += 1) {
        if (!parsed[i].id || !parsed[i].name) continue;
        state[STATE_KEY].monsters[parsed[i].id] = parsed[i];
      }
      gmWhisper(parsed.length + "개 몬스터 데이터를 불러왔어요. <a href=\"!ar-monster list\">목록 보기</a>");
    });
  }

  function handleMessage(msg) {
    var parts;
    var command;
    var arg;
    var monster;
    var all;
    var keys;
    var i;

    if (msg.type !== "api") return;
    if (msg.content.indexOf("!ar-monster") !== 0) return;
    if (!playerIsGM(msg.playerid)) {
      whisper(msg.who, "GM만 사용할 수 있는 명령입니다.");
      return;
    }

    initState();
    parts = msg.content.split(/\s+/);
    command = parts[1] || "help";
    arg = parts.slice(2).join(" ");

    if (command === "help") {
      gmWhisper(help());
      return;
    }
    if (command === "list") {
      gmWhisper(renderList());
      return;
    }
    if (command === "clear-handout") {
      state[STATE_KEY].monsters = {};
      gmWhisper("핸드아웃으로 불러온 몬스터 데이터를 지웠어요.");
      return;
    }
    if (command === "handout") {
      loadHandout(arg);
      return;
    }
    if (command === "import") {
      monster = findMonster(arg);
      if (!monster) {
        gmWhisper("몬스터를 찾지 못했어요: <b>" + esc(arg) + "</b>");
        return;
      }
      importMonster(monster, msg);
      gmWhisper("<b>" + esc(monster.name) + "</b> 생성 완료.");
      return;
    }
    if (command === "import-all") {
      all = getAllMonsters();
      keys = Object.keys(all);
      for (i = 0; i < keys.length; i += 1) {
        importMonster(all[keys[i]], msg, { noToken: true });
      }
      gmWhisper(keys.length + "개 몬스터 캐릭터 생성 완료. 토큰은 개별 import로 생성하세요.");
      return;
    }

    gmWhisper(help());
  }

  function register() {
    initState();
    on("chat:message", handleMessage);
    log("Arianrod Monster Importer v" + VERSION + " ready");
  }

  return {
    register: register
  };
}());

on("ready", function () {
  "use strict";
  ArianrodMonsterImporter.register();
});
