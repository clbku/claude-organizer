import { type MaybeRefOrGetter, toValue, watch, onScopeDispose } from "vue";
import type { CoSocketMessage } from "@claude-organizer/shared";

export type { CoEvent, CoSocketMessage } from "@claude-organizer/shared";

export function useProjectEvents(
  projectId: MaybeRefOrGetter<string | null | undefined>,
  handler: (event: CoSocketMessage) => void,
) {
  if (import.meta.server) return;

  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl as string;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manualClose = false;

  function close() {
    manualClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function connect(id: string) {
    manualClose = false;
    const wsUrl = apiUrl.replace(/^http/, "ws") + `/ws/projects/${id}`;
    socket = new WebSocket(wsUrl);

    socket.addEventListener("message", (e) => {
      try {
        const event = JSON.parse(e.data) as CoSocketMessage;
        handler(event);
      } catch {
        // ignore malformed
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (manualClose) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(id), 2000);
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  }

  watch(
    () => toValue(projectId),
    (id) => {
      close();
      if (id) connect(id);
    },
    { immediate: true },
  );

  onScopeDispose(() => close());
}
