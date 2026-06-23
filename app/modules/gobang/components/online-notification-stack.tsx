import { type ReactElement } from "react";

import { type OnlineNotificationItem } from "@/modules/gobang/online-notifications";

type OnlineNotificationStackProps = {
  notifications: readonly OnlineNotificationItem[];
};

export function OnlineNotificationStack({
  notifications
}: OnlineNotificationStackProps): ReactElement | null {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="online-notification-layer">
      <div className="online-notification-stack">
        {notifications.map((notification: OnlineNotificationItem) => (
          <div
            className="online-notification-item"
            data-event={notification.event}
            key={notification.id}
          >
            <span>{notification.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
