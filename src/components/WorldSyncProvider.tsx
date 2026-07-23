"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { usePolling } from "@/lib/usePolling";
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
  refresh: () => Promise<void>;
};

const Ctx = createContext<SyncCtx | null>(null);

const POLL_MS = 12000;

export function WorldSyncProvider({ children }: { children: ReactNode }) {
  const afterRef = useRef(0);
  const [batch, setBatch] = useState<ChatMessage[]>([]);
  const [people, setPeople] = useState<PresencePerson[] | null>(null);
  const [rift, setRift] = useState<RiftContext | null>(null);

  const runSync = useCallback(async () => {
    try {
      const res = await fetch(`/api/world/sync?after=${afterRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as WorldSyncPayload;
      if (data.messages?.length) setBatch(data.messages);
      if (data.people) setPeople(data.people);
      if (data.rift) setRift(data.rift);
    } catch {
      /* 다음 폴링에서 회복 */
    }
  }, []);

  usePolling(() => void runSync(), POLL_MS);

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
