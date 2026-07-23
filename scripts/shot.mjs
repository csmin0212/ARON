// 헤드리스 스크린샷 도구 — 인앱 브라우저 패널의 캡처가 이 환경에서 멈추는 문제 우회.
// 시스템 Chrome/Edge 를 헤드리스로 띄워 CDP 로 페이지를 찍어 PNG 로 저장한다.
// 공개 페이지는 물론, --as=<username> 로 세션 쿠키를 주입해 로그인 페이지도 찍는다.
//
// 사용법:
//   node scripts/shot.mjs --path=/carddemo --out=card.png
//   node scripts/shot.mjs --path=/profile?section=edit --as=ironknight --out=profile-edit.png
//   node scripts/shot.mjs --path=/u/ironknight --w=820 --scale=2
//
// ⚠️ Git Bash(MSYS)에서는 앞에 MSYS_NO_PATHCONV=1 을 붙여야 --path 의 앞 슬래시가
//    Windows 경로로 변환되지 않는다. PowerShell/cmd 에서는 필요 없다.
//      MSYS_NO_PATHCONV=1 node scripts/shot.mjs --path=/profile?section=edit --as=ironknight
//
// 옵션:
//   --path   찍을 경로 (기본 /)
//   --out    저장 파일 (기본 shot.png, 절대/상대 모두 가능)
//   --as     이 username 으로 로그인한 것처럼 세션 쿠키 주입 (선택)
//   --click  이 텍스트가 든 버튼/링크를 눌러 모달 등을 연 뒤 캡처 (선택)
//   --wait   클릭 후 추가 대기 ms (선택)
//   --base   베이스 URL (기본 http://localhost:3000)
//   --w      뷰포트 너비 (기본 820)
//   --scale  디바이스 픽셀 배율 (기본 2)
//   --viewport  전체 페이지 대신 뷰포트만 (기본은 전체 페이지)
//   --h      뷰포트 높이 (--viewport 일 때만, 기본 1400)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── .env 로드 (다른 스크립트와 동일 방식) ──
try {
  for (const l of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {}

// ── 인자 파싱 ──
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
// 앞 슬래시 없이 줘도 됨 (Git Bash 경로 변환을 피하는 안전한 형태)
let pathname = String(args.path ?? "/");
if (!/^\//.test(pathname)) pathname = "/" + pathname;
const base = String(args.base ?? "http://localhost:3000");
const outArg = String(args.out ?? "shot.png");
const out = path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg);
const width = Number(args.w ?? 820);
const scale = Number(args.scale ?? 2);
const fullPage = !args.viewport;
const vpHeight = Number(args.h ?? 1400);
const asUser = args.as ? String(args.as) : null;
const clickText = args.click ? String(args.click) : null;
const waitMs = Number(args.wait ?? 0);

// ── Chrome/Edge 탐색 ──
function findBrowser() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("Chrome/Edge 를 찾지 못했습니다.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 최소 CDP 클라이언트 (browser ws + flatten 세션) ──
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error("ws 연결 실패")), { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
}

async function main() {
  const browser = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shot-profile-"));
  const proc = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );

  // DevToolsActivePort 파일에서 실제 포트 읽기
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  let port = null;
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(portFile)) {
      const line = fs.readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (line) {
        port = line;
        break;
      }
    }
    await sleep(100);
  }
  if (!port) throw new Error("DevTools 포트를 얻지 못했습니다.");

  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const cdp = await CDP.connect(version.webSocketDebuggerUrl);

  // 타겟(페이지) 생성 + attach
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: vpHeight,
    deviceScaleFactor: scale,
    mobile: false,
  }, sessionId);

  // 로그인 세션 쿠키 주입
  if (asUser) {
    const { PrismaClient } = await import(
      pathToFileURL(path.join(ROOT, "src/generated/prisma/index.js")).href
    );
    const { SignJWT } = await import("jose");
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({
      where: { username: asUser },
      select: { id: true, nickname: true },
    });
    await prisma.$disconnect();
    if (!user) throw new Error(`유저를 찾지 못했습니다: ${asUser}`);
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const token = await new SignJWT({ uid: user.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    await cdp.send(
      "Network.setCookie",
      { name: "session", value: token, url: base, path: "/", httpOnly: true, sameSite: "Lax" },
      sessionId,
    );
    console.log(`🔑 세션 주입: ${asUser} (${user.nickname})`);
  }

  // 로드 완료 대기
  const loaded = new Promise((resolve) => {
    cdp.on((msg) => {
      if (msg.method === "Page.loadEventFired" && msg.sessionId === sessionId) resolve();
    });
  });
  const target = `${base}${pathname}`;
  console.log(`➡️  navigate: ${JSON.stringify(target)}`);
  await cdp.send("Page.navigate", { url: target }, sessionId);
  await Promise.race([loaded, sleep(15000)]);
  await sleep(700); // 폰트·레이아웃 안정화

  // --click: 텍스트가 들어간 버튼/링크를 눌러 모달 등을 연 뒤 찍는다.
  if (clickText) {
    let clicked = "not-found";
    for (let i = 0; i < 20 && clicked !== "ok"; i += 1) {
      const { result } = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `(()=>{const t=${JSON.stringify(clickText)};
            const el=[...document.querySelectorAll('button,a,[role="button"]')].find(e=>(e.innerText||'').includes(t));
            if(!el) return 'not-found';
            el.click(); return 'ok';})()`,
          returnByValue: true,
        },
        sessionId,
      );
      clicked = result.value;
      if (clicked !== "ok") await sleep(1000);
    }
    console.log(`🖱️  click ${JSON.stringify(clickText)}: ${clicked}`);
    await sleep(600);
  }
  if (waitMs > 0) await sleep(waitMs);

  // 무한 CSS 애니메이션은 캡처를 멈추게 하므로 정지시킨다.
  await cdp.send(
    "Runtime.evaluate",
    {
      expression:
        "(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none !important;transition:none !important;}';document.head.appendChild(s);})()",
    },
    sessionId,
  );
  await sleep(150);

  // 전체 페이지면 실제 콘텐츠 높이로 캡처
  let clip;
  if (fullPage) {
    const { cssContentSize } = await cdp.send("Page.getLayoutMetrics", {}, sessionId);
    clip = {
      x: 0,
      y: 0,
      width: Math.ceil(cssContentSize.width),
      height: Math.ceil(cssContentSize.height),
      scale: 1,
    };
  }

  const { data } = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) },
    sessionId,
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`📸 저장: ${out}`);

  cdp.ws.close();
  proc.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
