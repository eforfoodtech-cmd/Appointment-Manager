import React, { useState, useRef, useCallback } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

type ToastType = "success" | "error" | "info";

const BG: Record<ToastType, string> = {
  success: "#059669",
  error:   "#DC2626",
  info:    "#1C3461",
};
const ICON: Record<ToastType, React.ComponentProps<typeof Feather>["name"]> = {
  success: "check-circle",
  error:   "x-circle",
  info:    "info",
};

export function useToast() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, t: ToastType = "success") => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(msg);
      setType(t);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(
          () => setVisible(false),
        );
      }, 2800);
    },
    [opacity],
  );

  const ToastComponent = visible ? (
    <Animated.View
      style={[
        styles.toast,
        Platform.OS === "web" ? { pointerEvents: "none" } : null,
        { backgroundColor: BG[type], opacity },
      ]}
    >
      <Feather name={ICON[type]} size={16} color="#fff" />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  ) : null;

  return { showToast, ToastComponent };
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    zIndex: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
});
