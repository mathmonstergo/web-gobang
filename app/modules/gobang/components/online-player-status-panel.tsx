import {
  useEffect,
  useRef,
  useState,
  type ReactElement
} from "react";

import {
  createOnlinePlayerStatusModels,
  type OnlinePlayerStatusModel
} from "@/modules/gobang/online-player-status";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

const TIMER_TICK_MS = 250;

type OnlinePlayerStatusPanelProps = {
  snapshot: OnlineRoomSnapshot;
};

export function OnlinePlayerStatusPanel({
  snapshot
}: OnlinePlayerStatusPanelProps): ReactElement {
  const receivedAtRef = useRef(Date.now());
  const serverNowRef = useRef(snapshot.serverNow);
  const [localNow, setLocalNow] = useState(() => Date.now());

  useEffect(() => {
    receivedAtRef.current = Date.now();
    serverNowRef.current = snapshot.serverNow;
    setLocalNow(Date.now());
  }, [snapshot.serverNow]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLocalNow(Date.now());
    }, TIMER_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const effectiveServerNow =
    serverNowRef.current + Math.max(0, localNow - receivedAtRef.current);
  const players = createOnlinePlayerStatusModels(
    snapshot,
    effectiveServerNow
  );

  return (
    <div className="online-player-status" aria-label="联机玩家状态">
      {players.map((player: OnlinePlayerStatusModel) => (
        <div
          className={[
            "online-player-card",
            `is-${player.color}`,
            player.isCurrentTurn ? "is-current" : ""
          ].join(" ")}
          key={player.color}
        >
          <span
            className="online-player-avatar"
            style={{ backgroundColor: player.avatarColor }}
          >
            {player.avatarInitial}
          </span>
          <span className="online-player-copy">
            <strong>{player.nickname}</strong>
            {player.timerText === null ? null : <small>{player.timerText}</small>}
          </span>
          <span
            aria-hidden="true"
            className={[
              "online-connection-dot",
              player.isOnline ? "is-online" : "is-offline"
            ].join(" ")}
          />
        </div>
      ))}
    </div>
  );
}
