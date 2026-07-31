"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { usePolling, type PollOptions } from "@/lib/usePolling";
import type { WorldSyncPayload } from "@/app/api/world/sync/route";
import type { ChatMessage } from "@/app/api/world/chat/route";
import type { PresencePerson } from "@/app/api/world/presence/route";
import type { RiftContext } from "@/lib/worldCache";

// 월드 폴링 단일화 — 채팅·접속자·균열이 각자 돌던 3개의 폴링을 하나로 합친다.
// (백그라운드 탭에서는 usePolling 이 알아서 멈춘다)

type SyncCtx = {
  batch: ChatMessage[]; // 마지막 응답의 새 메시지 (WorldChat 이 누적)
  people: PresencePerson[] | null;
  rift: RiftContext | null;
  /** WorldChat 이 누적 후 마지막 id 를 알려주면 다음 폴링에 반영된다 */
  setAfter: (id: number) => void;
  /** 행동 직후 등 즉시 갱신이 필요할 때 */
  refresh: () => Promise<boolean>;
};

const Ctx = createContext<SyncCtx | null>(null);

// 이 간격은 '남이 보낸 메시지가 뜨기까지'만 좌우한다 (내가 한 행동은 refresh 로 즉시 반영).
// 대화가 오갈 땐 10초, 조용해지면 60초까지 늘어나고, 2분간 조작이 없으면 아예 멈춘다.
// RP 는 대화가 몰렸다 끊겼다 하므로 고정 간격은 대부분의 호출을 빈 응답에 쓴다.
const POLL: PollOptions = { minMs: 10_000, maxMs: 60_000, idleMs: 2 * 60_000 };

export function WorldSyncProvider({ children }: { children: ReactNode }) {
  const afterRef = useRef(0);
  const [batch, setBatch] = useState<ChatMessage[]>([]);
  const [people, setPeople] = useState<PresencePerson[] | null>(null);
  const [rift, setRift] = useState<RiftContext | null>(null);

  // 바뀐 게 있을 때만 setState 한다 — 매번 갈아끼우면 접속자 목록이 폴링마다 헛되이 다시 그려지고,
  // 폴링 백오프도 "변화 없음"을 알 수 없어 간격을 못 늘린다.
  const peopleKeyRef = useRef("");
  const riftKeyRef = useRef("");

  const runSync = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/world/sync?after=${afterRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as WorldSyncPayload;
      let changed = false;

      if (data.messages?.length) {
        setBatch(data.messages);
        changed = true;
      }
      const peopleKey = JSON.stringify(data.people ?? null);
      if (data.people && peopleKey !== peopleKeyRef.current) {
        peopleKeyRef.current = peopleKey;
        setPeople(data.people);
        changed = true;
      }
      const riftKey = JSON.stringify(data.rift ?? null);
      if (data.rift && riftKey !== riftKeyRef.current) {
        riftKeyRef.current = riftKey;
        setRift(data.rift);
        changed = true;
      }
      return changed;
    } catch {
      return false; /* 다음 폴링에서 회복 */
    }
  }, []);

  usePolling(runSync, POLL);

  return (
    <Ctx.Provider
      value={{
        batch,
        people,
        rift,
        setAfter: (id) => {
          afterRef.current = id;
        },
        refresh: runSync,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorldSync(): SyncCtx | null {
  return useContext(Ctx);
}
