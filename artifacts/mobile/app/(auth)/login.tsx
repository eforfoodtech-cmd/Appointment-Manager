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
import { Feather } from "@expo/vector-icons";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { AuthBackgroundTexture } from "@/components/AuthBackgroundTexture";
import colors from "@/constants/colors";
import { isTurkishMobilePhone } from "@/utils/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeIdentifier(value: string) {
  const trimmed = value.trim();

  if (trimmed.includes("@")) {
    return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : "";
  }

  if (isTurkishMobilePhone(trimmed)) return trimmed;

  return "";
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuth();
  const [identifier, setIdentifier] = useState("");
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
    const normalizedIdentifier = normalizeIdentifier(identifier);
    if (!normalizedIdentifier) {
      Alert.alert("Hata", "Geçerli bir e-posta veya telefon numarası girin");
      return;
    }
    if (password.length < 6 || password.length > 72) {
      Alert.alert("Hata", "Şifre 6-72 karakter arasında olmalı");
      return;
    }
    loginMutation.mutate({
      data: { identifier: normalizedIdentifier, password },
    });
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AuthBackgroundTexture />
      <View style={styles.authCard}>
        <View style={styles.barberStripe}>
          <View style={[styles.stripeSegment, styles.stripeRed]} />
          <View style={[styles.stripeSegment, styles.stripeLight]} />
          <View style={[styles.stripeSegment, styles.stripeBlue]} />
          <View style={[styles.stripeSegment, styles.stripeGold]} />
        </View>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Feather name="scissors" size={28} color={c.accent} />
          </View>
          <Text style={styles.logo}>Tıraş</Text>
          <Text style={styles.subtitle}>Berber Randevu Sistemi</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Giriş Yap</Text>
          <Text style={styles.formSubtitle}>Randevu akışına devam edin.</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-posta veya Telefon</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="ornek@mail.com veya 5551112233"
              placeholderTextColor={colors.light.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              maxLength={254}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="En az 6 karakter"
              placeholderTextColor={colors.light.mutedForeground}
              secureTextEntry
              maxLength={72}
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => router.push("/(auth)/forgot-password")}
          >
            <Text style={styles.forgotLinkText}>Şifremi Unuttum</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              loginMutation.isPending && styles.buttonDisabled,
            ]}
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
              Hesabın yok mu? <Text style={styles.linkBold}>Kayıt Ol</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const c = colors.light;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    position: "relative",
  },
  authCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: c.card,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    zIndex: 1,
  },
  barberStripe: {
    flexDirection: "row",
    height: 8,
    backgroundColor: c.card,
  },
  stripeSegment: { flex: 1 },
  stripeRed: { backgroundColor: "#C94B4B" },
  stripeLight: { backgroundColor: "#F7F3E9" },
  stripeBlue: { backgroundColor: "#2F5F8F" },
  stripeGold: { backgroundColor: c.accent },
  header: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.card,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 26,
    gap: 10,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    color: c.primary,
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
    letterSpacing: 0,
  },
  form: {
    backgroundColor: c.card,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  formSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: -10,
    marginBottom: 2,
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
    backgroundColor: c.background,
    borderRadius: colors.radius,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
  },
  forgotLink: {
    alignSelf: "flex-end",
    paddingVertical: 2,
    marginTop: -6,
  },
  forgotLinkText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.primary,
  },
  button: {
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
    shadowColor: c.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
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
