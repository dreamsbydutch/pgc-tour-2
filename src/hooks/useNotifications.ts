import { useUser } from "@clerk/tanstack-react-start";
import { useCallback, useEffect, useState } from "react";

import { api, type Id, useMutation, useQuery } from "@/convex";
import type {
  NotificationCategory,
  NotificationPreferences,
  PushDeviceState,
} from "@/types";

export function useNotificationCenter() {
  const { user } = useUser();
  const center = useQuery(
    api.functions.notifications.getMyCenter,
    user ? {} : "skip",
  );
  const markReadMutation = useMutation(api.functions.notifications.markRead);
  const markAllReadMutation = useMutation(
    api.functions.notifications.markAllRead,
  );
  return {
    items: center?.items ?? [],
    unreadCount: center?.unreadCount ?? 0,
    isLoading: Boolean(user && center === undefined),
    markRead: (notificationId: Id<"notifications">) =>
      markReadMutation({ notificationId }),
    markAllRead: () => markAllReadMutation({}),
  };
}

export function useNotificationPreferences() {
  const { user } = useUser();
  const configuration = useQuery(
    api.functions.notifications.getMyPreferences,
    user ? {} : "skip",
  );
  const updatePreferences = useMutation(
    api.functions.notifications.updateMyPreferences,
  );
  const registerSubscription = useMutation(
    api.functions.notifications.registerPushSubscription,
  );
  const unregisterSubscription = useMutation(
    api.functions.notifications.unregisterPushSubscription,
  );
  const [deviceState, setDeviceState] =
    useState<PushDeviceState>("not-enabled");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [busyCategory, setBusyCategory] = useState<NotificationCategory | null>(
    null,
  );

  const refreshDeviceState = useCallback(async () => {
    if (!supportsWebPush()) {
      setDeviceState("unsupported");
      return;
    }
    if (!configuration?.vapidPublicKey) {
      setDeviceState("not-configured");
      return;
    }
    if (Notification.permission === "denied") {
      setDeviceState("blocked");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.getSubscription();
    setDeviceState(subscription ? "enabled" : "not-enabled");
  }, [configuration?.vapidPublicKey]);

  useEffect(() => {
    if (!user || configuration === undefined) return;
    void refreshDeviceState().catch(() => setDeviceState("error"));
  }, [configuration, refreshDeviceState, user]);

  const enablePush = useCallback(async () => {
    if (!configuration?.vapidPublicKey || !supportsWebPush()) return;
    setDeviceState("busy");
    setDeviceError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDeviceState(permission === "denied" ? "blocked" : "not-enabled");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(
            configuration.vapidPublicKey,
          ),
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("The browser returned an incomplete subscription");
      }
      await registerSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      setDeviceState("enabled");
    } catch (error) {
      setDeviceState("error");
      setDeviceError(
        error instanceof Error
          ? error.message
          : "Unable to enable push notifications",
      );
    }
  }, [configuration?.vapidPublicKey, registerSubscription]);

  const disablePush = useCallback(async () => {
    if (!supportsWebPush()) return;
    setDeviceState("busy");
    setDeviceError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unregisterSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setDeviceState("not-enabled");
    } catch (error) {
      setDeviceState("error");
      setDeviceError(
        error instanceof Error
          ? error.message
          : "Unable to disable push notifications",
      );
    }
  }, [unregisterSubscription]);

  const setPreference = useCallback(
    async (category: NotificationCategory, enabled: boolean) => {
      if (!configuration) return;
      setBusyCategory(category);
      try {
        await updatePreferences({
          ...configuration.preferences,
          [category]: enabled,
        });
      } finally {
        setBusyCategory(null);
      }
    },
    [configuration, updatePreferences],
  );

  return {
    preferences: configuration?.preferences as
      | NotificationPreferences
      | undefined,
    subscribedDeviceCount: configuration?.subscribedDeviceCount ?? 0,
    isLoading: Boolean(user && configuration === undefined),
    deviceState,
    deviceError,
    busyCategory,
    enablePush,
    disablePush,
    setPreference,
  };
}

function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
