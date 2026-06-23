import { useCallback, useEffect, useRef, useState } from "react";

import {
  createOnlineRoom,
  buildRoomWebSocketUrl
} from "@/modules/gobang/online-room-client";
import {
  appendOnlineNotification,
  dismissOnlineNotification,
  type OnlineNotificationItem
} from "@/modules/gobang/online-notifications";
import {
  loadOnlineSession,
  saveOnlineSession,
  type OnlineProfile,
  type OnlineSession
} from "@/modules/gobang/online-storage";
import {
  type ClientMessage,
  type CreateOnlineRoomResponse,
  type OnlineGamePhase,
  type OnlineModeStatus,
  type OnlineNotificationEvent,
  type OnlineRoomSnapshot,
  type OnlineServerMessage
} from "@/modules/gobang/online-types";
import { type Position } from "@/modules/gobang/types";

const FAST_HEARTBEAT_INTERVAL_MS = 1000;
const RECONNECT_DELAY_MS = 1200;
const ONLINE_NOTIFICATION_DURATION_MS = 3200;
const OPEN_SOCKET_STATE = 1;
const DEFAULT_AVATAR_COLOR = "#2f8f68";
const ONLINE_AVATAR_COLORS: readonly string[] = [
  "#2f8f68",
  "#5f79c8",
  "#b67831",
  "#9a5ca8",
  "#c4564f",
  "#457b9d",
  "#7f8232",
  "#5f8b4c"
];

type OnlineAvatar = {
  avatarInitial: string;
  avatarColor: string;
};

type OnlineAvatarInput = {
  nickname: string;
  playerId: string;
};

export type OfficialClientAction =
  | { type: "place"; position: Position }
  | { type: "request_undo" }
  | { type: "respond_undo"; requestId: string; accept: boolean }
  | { type: "request_surrender" }
  | { type: "respond_surrender"; requestId: string; accept: boolean }
  | { type: "start_game" }
  | { type: "reset_animation_complete"; gameNumber: number };

export type OnlineRoomConnectionInput = {
  roomCode: string;
  inviteUrl: string;
  profile: OnlineProfile;
};

export type OnlineRoomConnection = {
  roomCode: string;
  inviteUrl: string;
  profile: OnlineProfile;
  avatar: OnlineAvatar;
};

type PreparedOnlineRoomConnection = OnlineRoomConnection & {
  session: OnlineSession;
};

export type UseOnlineGobangRoomOptions = {
  notificationDurationMs?: number;
};

export type UseOnlineGobangRoomResult = {
  status: OnlineModeStatus;
  snapshot: OnlineRoomSnapshot | null;
  notifications: readonly OnlineNotificationItem[];
  currentRoom: OnlineRoomConnection | null;
  error: string | null;
  createRoomAndConnect: (
    profile: OnlineProfile
  ) => Promise<CreateOnlineRoomResponse>;
  connectRoom: (input: OnlineRoomConnectionInput) => void;
  leaveRoom: () => void;
  dismissNotification: (id: string) => void;
  addLocalNotification: (
    event: OnlineNotificationEvent,
    text: string
  ) => void;
  placeAt: (position: Position) => boolean;
  requestUndo: () => boolean;
  respondUndo: (requestId: string, accept: boolean) => boolean;
  requestSurrender: () => boolean;
  respondSurrender: (requestId: string, accept: boolean) => boolean;
  startGame: () => boolean;
  startNewGame: () => boolean;
  completeResetAnimation: (gameNumber: number) => boolean;
};

export function useOnlineGobangRoom(
  options: UseOnlineGobangRoomOptions = {}
): UseOnlineGobangRoomResult {
  const notificationDurationMs =
    options.notificationDurationMs ?? ONLINE_NOTIFICATION_DURATION_MS;
  const [status, setStatus] = useState<OnlineModeStatus>("idle");
  const [snapshot, setSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const [notifications, setNotifications] = useState<OnlineNotificationItem[]>(
    []
  );
  const [currentRoom, setCurrentRoom] =
    useState<OnlineRoomConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const connectionRef = useRef<PreparedOnlineRoomConnection | null>(null);
  const snapshotRef = useRef<OnlineRoomSnapshot | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const notificationTimersRef = useRef<Map<string, number>>(new Map());
  const shouldReconnectRef = useRef(false);
  const openSocketRef = useRef<
    ((connection: PreparedOnlineRoomConnection) => void) | null
  >(null);

  snapshotRef.current = snapshot;

  const clearHeartbeatTimer = useCallback((): void => {
    if (heartbeatTimerRef.current === null) {
      return;
    }

    window.clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback((): void => {
    if (reconnectTimerRef.current === null) {
      return;
    }

    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const dismissNotification = useCallback((id: string): void => {
    const timeoutId = notificationTimersRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      notificationTimersRef.current.delete(id);
    }

    setNotifications((currentNotifications: OnlineNotificationItem[]) =>
      dismissOnlineNotification(currentNotifications, id)
    );
  }, []);

  const clearNotificationTimers = useCallback((): void => {
    for (const timeoutId of notificationTimersRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    notificationTimersRef.current.clear();
  }, []);

  const addLocalNotification = useCallback(
    (event: OnlineNotificationEvent, text: string): void => {
      const notification: OnlineNotificationItem = {
        event,
        id: createClientId("notification"),
        text
      };
      setNotifications((currentNotifications: OnlineNotificationItem[]) =>
        appendOnlineNotification(currentNotifications, notification)
      );

      if (notificationDurationMs <= 0) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        dismissNotification(notification.id);
      }, notificationDurationMs);
      notificationTimersRef.current.set(notification.id, timeoutId);
    },
    [dismissNotification, notificationDurationMs]
  );

  const sendClientMessage = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== OPEN_SOCKET_STATE) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const sendHeartbeat = useCallback((): boolean => {
    const currentSnapshot = snapshotRef.current;
    return sendClientMessage({
      type: "heartbeat",
      gameNumber: currentSnapshot?.gameNumber ?? 1,
      sentAt: Date.now()
    });
  }, [sendClientMessage]);

  const startHeartbeatTimer = useCallback((): void => {
    clearHeartbeatTimer();
    sendHeartbeat();

    const currentPhase = snapshotRef.current?.phase ?? null;
    heartbeatTimerRef.current = window.setInterval(() => {
      sendHeartbeat();
    }, getHeartbeatIntervalMs(currentPhase));
  }, [clearHeartbeatTimer, sendHeartbeat]);

  const handleServerMessage = useCallback(
    (message: OnlineServerMessage): void => {
      switch (message.type) {
        case "snapshot":
          setSnapshot(message.state);
          setStatus("connected");
          setError(null);
          return;
        case "notification":
          addLocalNotification(message.event, message.text);
          return;
        case "error":
          setStatus(message.code === "room-full" ? "room-full" : "error");
          setError(message.message);
          return;
      }
    },
    [addLocalNotification]
  );

  const openSocket = useCallback(
    (connection: PreparedOnlineRoomConnection): void => {
      clearReconnectTimer();
      clearHeartbeatTimer();

      const previousSocket = socketRef.current;
      socketRef.current = null;
      previousSocket?.close();

      const socket = new WebSocket(
        buildRoomWebSocketUrl({
          origin: window.location.origin,
          roomCode: connection.roomCode,
          playerId: connection.session.playerId,
          sessionToken: connection.session.sessionToken,
          nickname: connection.profile.nickname,
          avatarInitial: connection.avatar.avatarInitial,
          avatarColor: connection.avatar.avatarColor
        })
      );

      socketRef.current = socket;
      setStatus("joining");
      setError(null);

      socket.addEventListener("open", () => {
        if (socketRef.current !== socket) {
          return;
        }

        setStatus("connected");
        startHeartbeatTimer();
      });

      socket.addEventListener("message", (event: MessageEvent) => {
        if (socketRef.current !== socket) {
          return;
        }

        const message = parseOnlineServerMessage(event.data);
        if (message !== null) {
          handleServerMessage(message);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current !== socket) {
          return;
        }

        clearHeartbeatTimer();
        socketRef.current = null;
        setStatus("disconnected");

        if (!shouldReconnectRef.current) {
          return;
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          const nextConnection = connectionRef.current;
          if (nextConnection !== null && shouldReconnectRef.current) {
            openSocketRef.current?.(nextConnection);
          }
        }, RECONNECT_DELAY_MS);
      });

      socket.addEventListener("error", () => {
        if (socketRef.current !== socket) {
          return;
        }

        setStatus("error");
        setError("房间连接失败");
      });
    },
    [
      clearHeartbeatTimer,
      clearReconnectTimer,
      handleServerMessage,
      startHeartbeatTimer
    ]
  );

  useEffect(() => {
    openSocketRef.current = openSocket;
  }, [openSocket]);

  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.readyState !== OPEN_SOCKET_STATE) {
      return;
    }

    startHeartbeatTimer();
  }, [snapshot?.phase, startHeartbeatTimer]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      clearHeartbeatTimer();
      clearNotificationTimers();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [clearHeartbeatTimer, clearNotificationTimers, clearReconnectTimer]);

  const connectRoom = useCallback(
    (input: OnlineRoomConnectionInput): void => {
      const session = prepareOnlineRoomSession(
        input.roomCode,
        input.profile,
        loadOnlineSession(input.roomCode),
        () => createClientId("session")
      );
      saveOnlineSession(session);

      const avatar = deriveOnlineAvatar({
        nickname: input.profile.nickname,
        playerId: input.profile.playerId
      });
      const connection: PreparedOnlineRoomConnection = {
        ...input,
        avatar,
        session
      };
      connectionRef.current = connection;
      shouldReconnectRef.current = true;
      setCurrentRoom(toPublicConnection(connection));
      setSnapshot(null);
      openSocket(connection);
    },
    [openSocket]
  );

  const createRoomAndConnect = useCallback(
    async (profile: OnlineProfile): Promise<CreateOnlineRoomResponse> => {
      setStatus("creating");
      setError(null);

      try {
        const room = await createOnlineRoom();
        connectRoom({
          roomCode: room.roomCode,
          inviteUrl: room.inviteUrl,
          profile
        });
        return room;
      } catch (caughtError: unknown) {
        const message =
          caughtError instanceof Error ? caughtError.message : "创建房间失败";
        setStatus("error");
        setError(message);
        throw caughtError;
      }
    },
    [connectRoom]
  );

  const leaveRoom = useCallback((): void => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    clearHeartbeatTimer();
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    connectionRef.current = null;
    setCurrentRoom(null);
    setSnapshot(null);
    setStatus("idle");
    setError(null);
  }, [clearHeartbeatTimer, clearReconnectTimer]);

  const sendOfficialAction = useCallback(
    (action: OfficialClientAction): boolean => {
      const message = createOfficialClientMessage(snapshotRef.current, action);
      return message === null ? false : sendClientMessage(message);
    },
    [sendClientMessage]
  );

  const placeAt = useCallback(
    (position: Position): boolean =>
      sendOfficialAction({ type: "place", position }),
    [sendOfficialAction]
  );

  const requestUndo = useCallback(
    (): boolean => sendOfficialAction({ type: "request_undo" }),
    [sendOfficialAction]
  );

  const respondUndo = useCallback(
    (requestId: string, accept: boolean): boolean =>
      sendOfficialAction({ type: "respond_undo", requestId, accept }),
    [sendOfficialAction]
  );

  const requestSurrender = useCallback(
    (): boolean => sendOfficialAction({ type: "request_surrender" }),
    [sendOfficialAction]
  );

  const respondSurrender = useCallback(
    (requestId: string, accept: boolean): boolean =>
      sendOfficialAction({ type: "respond_surrender", requestId, accept }),
    [sendOfficialAction]
  );

  const startGame = useCallback(
    (): boolean => sendOfficialAction({ type: "start_game" }),
    [sendOfficialAction]
  );

  const startNewGame = startGame;

  const completeResetAnimation = useCallback(
    (gameNumber: number): boolean =>
      sendOfficialAction({ type: "reset_animation_complete", gameNumber }),
    [sendOfficialAction]
  );

  return {
    status,
    snapshot,
    notifications,
    currentRoom,
    error,
    createRoomAndConnect,
    connectRoom,
    leaveRoom,
    dismissNotification,
    addLocalNotification,
    placeAt,
    requestUndo,
    respondUndo,
    requestSurrender,
    respondSurrender,
    startGame,
    startNewGame,
    completeResetAnimation
  };
}

export function deriveOnlineAvatar(input: OnlineAvatarInput): OnlineAvatar {
  const firstCharacter = Array.from(input.nickname.trim())[0] ?? "?";
  const avatarInitial = /^[a-z]$/i.test(firstCharacter)
    ? firstCharacter.toUpperCase()
    : firstCharacter;
  const colorIndex =
    hashString(`${input.playerId}:${input.nickname}`) %
    ONLINE_AVATAR_COLORS.length;

  return {
    avatarInitial,
    avatarColor: ONLINE_AVATAR_COLORS[colorIndex] ?? DEFAULT_AVATAR_COLOR
  };
}

export function prepareOnlineRoomSession(
  roomCode: string,
  profile: OnlineProfile,
  savedSession: OnlineSession | null,
  createSessionToken: () => string
): OnlineSession {
  if (
    savedSession !== null &&
    savedSession.roomCode === roomCode &&
    savedSession.playerId === profile.playerId
  ) {
    return savedSession;
  }

  return {
    roomCode,
    playerId: profile.playerId,
    sessionToken: createSessionToken()
  };
}

export function getHeartbeatIntervalMs(
  phase: OnlineGamePhase | null
): number {
  void phase;
  return FAST_HEARTBEAT_INTERVAL_MS;
}

export function createOfficialClientMessage(
  snapshot: OnlineRoomSnapshot | null,
  action: OfficialClientAction
): ClientMessage | null {
  if (action.type === "reset_animation_complete") {
    return {
      type: "reset_animation_complete",
      gameNumber: action.gameNumber
    };
  }

  if (snapshot === null) {
    return null;
  }

  if (action.type === "start_game") {
    return snapshot.canStart ? { type: "start_game" } : null;
  }

  if (snapshot.phase !== "playing") {
    return null;
  }

  switch (action.type) {
    case "place":
      return {
        type: "place",
        row: action.position.row,
        col: action.position.col
      };
    case "request_undo":
      return { type: "request_undo" };
    case "respond_undo":
      return {
        type: "respond_undo",
        requestId: action.requestId,
        accept: action.accept
      };
    case "request_surrender":
      return { type: "request_surrender" };
    case "respond_surrender":
      return {
        type: "respond_surrender",
        requestId: action.requestId,
        accept: action.accept
      };
  }
}

function parseOnlineServerMessage(rawData: unknown): OnlineServerMessage | null {
  if (typeof rawData !== "string") {
    return null;
  }

  try {
    const value: unknown = JSON.parse(rawData);
    return isOnlineServerMessage(value) ? value : null;
  } catch {
    return null;
  }
}

function isOnlineServerMessage(value: unknown): value is OnlineServerMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "snapshot":
      return typeof candidate.state === "object" && candidate.state !== null;
    case "notification":
      return (
        typeof candidate.event === "string" &&
        typeof candidate.text === "string"
      );
    case "error":
      return (
        typeof candidate.code === "string" &&
        typeof candidate.message === "string"
      );
    default:
      return false;
  }
}

function toPublicConnection(
  connection: PreparedOnlineRoomConnection
): OnlineRoomConnection {
  return {
    roomCode: connection.roomCode,
    inviteUrl: connection.inviteUrl,
    profile: connection.profile,
    avatar: connection.avatar
  };
}

function createClientId(prefix: string): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (const character of Array.from(value)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}
