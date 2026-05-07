import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const PIN_RE = /^\d{6}$/;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await setAuth(data.token, data.user as any);
        if (data.user.role === "barber") {
          router.replace("/(barber)");
        } else {
          router.replace("/(customer)");
        }
      },
      onError: (err: any) => {
        Alert.alert("Hata", err?.data?.error || "Giriş başarısız");
      },
    },
  });

  const handleLogin = () => {
    if (phone.length !== 10) {
      Alert.alert("Hata", "Telefon numarası 10 haneli olmalı");
      return;
    }
    if (!PIN_RE.test(password)) {
      Alert.alert("Hata", "Şifre 6 haneli rakamlardan oluşmalı");
      return;
    }
    loginMutation.mutate({ data: { email: `0${phone}`, password } });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>✂ Tıraş</Text>
        <Text style={styles.subtitle}>Berber Randevu Sistemi</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.title}>Giriş Yap</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Telefon Numarası</Text>
          <View style={styles.phoneInput}>
            <Text style={styles.phonePrefix}>0</Text>
            <TextInput
              style={styles.phoneField}
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/\D/g, "").slice(0, 10))}
              placeholder="5551112233"
              placeholderTextColor={colors.light.mutedForeground}
              keyboardType="number-pad"
              maxLength={10}
              autoCapitalize="none"
              autoComplete="tel"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="6 haneli şifre"
            placeholderTextColor={colors.light.mutedForeground}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="password"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loginMutation.isPending && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loginMutation.isPending}
          activeOpacity={0.8}
        >
          {loginMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push("/(auth)/register")}
        >
          <Text style={styles.linkText}>
            Hesabın yok mu?{" "}
            <Text style={styles.linkBold}>Kayıt Ol</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const c = colors.light;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.primary,
    paddingBottom: 34,
  },
  header: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
    letterSpacing: 1,
  },
  form: {
    backgroundColor: c.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
    marginBottom: 8,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  input: {
    backgroundColor: c.secondary,
    borderRadius: colors.radius,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
  },
  phoneInput: {
    backgroundColor: c.secondary,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  phonePrefix: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    paddingRight: 4,
  },
  phoneField: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
  },
  button: {
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: c.primaryForeground,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  link: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  linkBold: {
    fontFamily: "Inter_600SemiBold",
    color: c.primary,
  },
});
