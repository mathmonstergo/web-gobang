import { describe, expect, it } from "vitest";

import {
  appendOnlineNotification,
  dismissOnlineNotification,
  type OnlineNotificationItem
} from "@/modules/gobang/online-notifications";

describe("online notifications", () => {
  it("keeps newest notifications at the end and trims old entries", () => {
    const notifications: OnlineNotificationItem[] = [
      createNotification("first"),
      createNotification("second"),
      createNotification("third")
    ];

    const nextNotifications = appendOnlineNotification(
      notifications,
      createNotification("fourth"),
      3
    );

    expect(nextNotifications.map((notification) => notification.id)).toEqual([
      "second",
      "third",
      "fourth"
    ]);
  });

  it("dismisses a notification by id", () => {
    const notifications: OnlineNotificationItem[] = [
      createNotification("first"),
      createNotification("second")
    ];

    expect(dismissOnlineNotification(notifications, "first")).toEqual([
      createNotification("second")
    ]);
  });
});

function createNotification(id: string): OnlineNotificationItem {
  return {
    event: "invite-copied",
    id,
    text: id
  };
}
