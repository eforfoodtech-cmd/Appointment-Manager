/**
 * usePushRegistration — registers the device's Expo push token with the API
 * once the user is authenticated. Customers receive appointment reminders
 * (1 day + 1 hour before). All steps are best-effort and fail silently so the
 * app never crashes when push is unavailable (e.g. web, Expo Go, denied
 * permissions, or no EAS projectId configured).
 *
 * Token ownership is refreshed per user session: registration re-runs whenever
 * the authenticated user changes (login/logout/account switch), so a token is
 * never left mapped to a previous account on a shared device. On a failed
 * registration the attempt is reset so the next render can retry.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRegisterPushToken } from "@workspace/api-client-react";

import { useAuth } from "@/context/AuthContext";

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

export function usePushRegistration() {
  const { user, token } = useAuth();
  const registerPushToken = useRegisterPushToken();
  // The user id we last (successfully or in-flight) registered for. Lets us
  // re-register when the account changes and avoid duplicate registrations for
  // the same account.
  const registeredForUserRef = useRef<number | null>(null);

  useEffect(() => {
    // Only register for authenticated customers on native platforms.
    if (Platform.OS === "web") return;
    if (!user || !token) {
      // Logged out: allow re-registration for the next user.
      registeredForUserRef.current = null;
      return;
    }
    if (user.role !== "customer") {
      registeredForUserRef.current = null;
      return;
    }
    if (registeredForUserRef.current === user.id) return;

    // Mark in-flight for this user to avoid duplicate concurrent attempts.
    registeredForUserRef.current = user.id;
    const attemptUserId = user.id;

    let cancelled = false;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const Device = await import("expo-device");

        if (!Device.isDevice) {
          // Push notifications do not work on simulators/emulators.
          return;
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          return;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Randevu Hatırlatmaları",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId = getProjectId();
        const tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        const expoPushToken = tokenResponse.data;
        if (cancelled || !expoPushToken) return;

        await registerPushToken.mutateAsync({
          data: {
            token: expoPushToken,
            platform: Platform.OS === "ios" ? "ios" : "android",
          },
        });
      } catch (err) {
        // Expo Go without an EAS projectId, denied permission, web, or a failed
        // network call — all expected. Never let push registration crash the
        // app. Reset so a later render can retry for this user.
        if (registeredForUserRef.current === attemptUserId) {
          registeredForUserRef.current = null;
        }
        if (__DEV__) {
          console.warn("Push registration skipped:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, token, registerPushToken]);
}
