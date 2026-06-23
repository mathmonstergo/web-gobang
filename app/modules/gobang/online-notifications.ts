import { type OnlineNotificationEvent } from "../../../worker/protocol";

export type OnlineNotificationItem = {
  event: OnlineNotificationEvent;
  id: string;
  text: string;
};

export function appendOnlineNotification(
  notifications: readonly OnlineNotificationItem[],
  notification: OnlineNotificationItem,
  limit = 4
): OnlineNotificationItem[] {
  return [...notifications, notification].slice(-limit);
}

export function dismissOnlineNotification(
  notifications: readonly OnlineNotificationItem[],
  id: string
): OnlineNotificationItem[] {
  return notifications.filter(
    (notification: OnlineNotificationItem) => notification.id !== id
  );
}
