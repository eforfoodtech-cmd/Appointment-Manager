import {
  Alert as NativeAlert,
  Platform,
  type AlertButton,
  type AlertOptions,
} from "react-native";

/** React Native Web's Alert is a no-op; preserve confirmations on the web. */
export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      NativeAlert.alert(title, message, buttons, options);
      return;
    }
    const text = [title, message].filter(Boolean).join("\n\n");
    const action = buttons?.find(
      (button) => button.style !== "cancel" && button.onPress,
    );
    if (action) {
      if (window.confirm(text)) action.onPress?.();
      else buttons?.find((button) => button.style === "cancel")?.onPress?.();
    } else {
      window.alert(text);
    }
  },
};
