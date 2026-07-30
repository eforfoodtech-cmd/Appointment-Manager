import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useRequestPasswordReset,
  useResetPassword,
  useVerifyPasswordReset,
} from "@workspace/api-client-react";
import { AuthBackgroundTexture } from "@/components/AuthBackgroundTexture";
import colors from "@/constants/colors";
import {
  isTurkishMobilePhone,
  sanitizeTurkishMobilePhone,
} from "@/utils/phone";

type Channel = "email" | "phone";
type Step = "method" | "target" | "code" | "password" | "success";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

function normalizeTarget(value: string, channel: Channel) {
  const trimmed = value.trim();
  if (channel === "email") {
    return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : "";
  }

  return isTurkishMobilePhone(trimmed) ? trimmed : "";
}

function errorMessage(error: any, fallback: string) {
  return error?.data?.error || error?.data?.message || fallback;
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("method");
  const [channel, setChannel] = useState<Channel>("email");
  const [target, setTarget] = useState("");
  const [resetId, setResetId] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const requestMutation = useRequestPasswordReset({
    mutation: {
      onSuccess: (data) => {
        setResetId(data.resetId);
        setCode("");
        setStep("code");
      },
      onError: (error: any) => {
        Alert.alert(
          "Hata",
          errorMessage(error, "Şifre sıfırlama kodu gönderilemedi"),
        );
      },
    },
  });

  const verifyMutation = useVerifyPasswordReset({
    mutation: {
      onSuccess: (data) => {
        setResetToken(data.resetToken);
        setStep("password");
      },
      onError: (error: any) => {
        Alert.alert(
          "Hata",
          errorMessage(error, "Doğrulama kodu geçersiz veya süresi dolmuş"),
        );
      },
    },
  });

  const resetMutation = useResetPassword({
    mutation: {
      onSuccess: () => {
        setStep("success");
      },
      onError: (error: any) => {
        Alert.alert(
          "Hata",
          errorMessage(error, "Şifre güncellenirken bir hata oluştu"),
        );
      },
    },
  });

  const handleBack = () => {
    if (step === "method") {
      router.back();
      return;
    }
    if (step === "target") {
      setStep("method");
      return;
    }
    if (step === "code") {
      setCode("");
      setStep("target");
      return;
    }
    if (step === "password") {
      setNewPassword("");
      setConfirmPassword("");
      setStep("code");
      return;
    }
    router.replace("/(auth)/login");
  };

  const handleRequestCode = () => {
    const identifier = normalizeTarget(target, channel);
    if (!identifier) {
      Alert.alert(
        "Hata",
        channel === "email"
          ? "Geçerli bir e-posta adresi girin"
          : "Telefon numarası 5 ile başlayan 10 haneli olmalı",
      );
      return;
    }

    requestMutation.mutate({ data: { identifier, channel } });
  };

  const handleVerifyCode = () => {
    if (!resetId) {
      Alert.alert(
        "Hata",
        "Sıfırlama isteği bulunamadı. Lütfen tekrar deneyin.",
      );
      setStep("target");
      return;
    }
    if (!CODE_RE.test(code)) {
      Alert.alert("Hata", "Doğrulama kodu 6 haneli olmalı");
      return;
    }

    verifyMutation.mutate({ data: { resetId, code } });
  };

  const handleResetPassword = () => {
    if (newPassword.length < 6 || newPassword.length > 72) {
      Alert.alert("Hata", "Yeni şifre 6-72 karakter arasında olmalı");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Hata", "Şifreler eşleşmiyor");
      return;
    }
    if (!resetToken) {
      Alert.alert("Hata", "Doğrulama süresi doldu. Lütfen tekrar deneyin.");
      setStep("target");
      return;
    }

    resetMutation.mutate({
      data: { resetToken, newPassword },
    });
  };

  const stepNumber =
    step === "method" ? 1 : step === "target" ? 2 : step === "code" ? 3 : 4;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingBottom: insets.bottom + 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <AuthBackgroundTexture />
      <View style={styles.authCard}>
        <View style={styles.barberStripe}>
          <View style={[styles.stripeSegment, styles.stripeRed]} />
          <View style={[styles.stripeSegment, styles.stripeLight]} />
          <View style={[styles.stripeSegment, styles.stripeBlue]} />
          <View style={[styles.stripeSegment, styles.stripeGold]} />
        </View>

        {step !== "success" && (
          <TouchableOpacity style={styles.back} onPress={handleBack}>
            <Feather name="chevron-left" size={18} color={c.primary} />
            <Text style={styles.backText}>Geri</Text>
          </TouchableOpacity>
        )}

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather
              name={step === "success" ? "check-circle" : "key"}
              size={22}
              color={c.accent}
            />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>
              {step === "success" ? "Şifreniz Güncellendi" : "Şifremi Unuttum"}
            </Text>
            <Text style={styles.subtitle}>
              {step === "success"
                ? "Yeni şifrenizle giriş yapabilirsiniz."
                : `Güvenli sıfırlama • ${stepNumber}/4`}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {step === "method" && (
            <>
              <Text style={styles.sectionTitle}>Yöntem Seçin</Text>
              <Text style={styles.description}>
                Doğrulama kodunu nasıl almak istediğinizi seçin.
              </Text>
              {(["email", "phone"] as Channel[]).map((item) => {
                const selected = channel === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.methodOption,
                      selected && styles.methodOptionSelected,
                    ]}
                    onPress={() => setChannel(item)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.methodIcon}>
                      <Feather
                        name={item === "email" ? "mail" : "smartphone"}
                        size={20}
                        color={selected ? c.primary : c.mutedForeground}
                      />
                    </View>
                    <View style={styles.methodCopy}>
                      <Text style={styles.methodTitle}>
                        {item === "email" ? "E-posta" : "Telefon"}
                      </Text>
                      <Text style={styles.methodDescription}>
                        {item === "email"
                          ? "Kod e-posta adresinize gönderilir"
                          : "Kod telefon numaranıza gönderilir"}
                      </Text>
                    </View>
                    <Feather
                      name={selected ? "check-circle" : "circle"}
                      size={20}
                      color={selected ? c.primary : c.border}
                    />
                  </TouchableOpacity>
                );
              })}
              <PrimaryButton
                label="Devam Et"
                onPress={() => {
                  setTarget("");
                  setStep("target");
                }}
              />
            </>
          )}

          {step === "target" && (
            <>
              <Text style={styles.sectionTitle}>
                {channel === "email"
                  ? "E-posta Adresiniz"
                  : "Telefon Numaranız"}
              </Text>
              <Text style={styles.description}>
                Hesabınızda kayıtlı{" "}
                {channel === "email"
                  ? "e-posta adresini"
                  : "telefon numarasını"}{" "}
                girin.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {channel === "email" ? "E-posta" : "Telefon"}
                </Text>
                <TextInput
                  style={styles.input}
                  value={target}
                  onChangeText={(value) =>
                    setTarget(
                      channel === "phone"
                        ? sanitizeTurkishMobilePhone(value)
                        : value,
                    )
                  }
                  placeholder={
                    channel === "email"
                      ? "ornek@mail.com"
                      : "5551112233"
                  }
                  placeholderTextColor={c.mutedForeground}
                  keyboardType={
                    channel === "email" ? "email-address" : "phone-pad"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={channel === "email" ? "email" : "tel"}
                  maxLength={channel === "email" ? 254 : 10}
                />
              </View>
              <PrimaryButton
                label="Kodu Gönder"
                onPress={handleRequestCode}
                loading={requestMutation.isPending}
              />
            </>
          )}

          {step === "code" && (
            <>
              <Text style={styles.sectionTitle}>Doğrulama Kodu</Text>
              <Text style={styles.description}>
                Gönderilen 6 haneli kodu girin. Güvenliğiniz için kodun süresi
                sınırlıdır.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>6 Haneli Kod</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(value) =>
                    setCode(value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  placeholderTextColor={c.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </View>
              <PrimaryButton
                label="Kodu Doğrula"
                onPress={handleVerifyCode}
                loading={verifyMutation.isPending}
              />
              <TouchableOpacity
                style={styles.textButton}
                onPress={handleRequestCode}
                disabled={requestMutation.isPending}
              >
                <Text style={styles.textButtonLabel}>Kodu Tekrar Gönder</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "password" && (
            <>
              <Text style={styles.sectionTitle}>Yeni Şifre Belirleyin</Text>
              <Text style={styles.description}>
                En az 6 karakterden oluşan yeni bir şifre girin.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Yeni Şifre</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="En az 6 karakter"
                  placeholderTextColor={c.mutedForeground}
                  secureTextEntry
                  maxLength={72}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Yeni Şifre Tekrar</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Şifrenizi tekrar girin"
                  placeholderTextColor={c.mutedForeground}
                  secureTextEntry
                  maxLength={72}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
              </View>
              <PrimaryButton
                label="Şifreyi Güncelle"
                onPress={handleResetPassword}
                loading={resetMutation.isPending}
              />
            </>
          )}

          {step === "success" && (
            <View style={styles.successContent}>
              <View style={styles.successIcon}>
                <Feather name="check" size={34} color={c.primaryForeground} />
              </View>
              <Text style={styles.successTitle}>İşlem Tamamlandı</Text>
              <Text style={[styles.description, styles.successDescription]}>
                Şifreniz başarıyla yenilendi. Yeni şifrenizle hesabınıza giriş
                yapabilirsiniz.
              </Text>
              <PrimaryButton
                label="Giriş Ekranına Dön"
                onPress={() => router.replace("/(auth)/login")}
              />
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function PrimaryButton({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={c.primaryForeground} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const c = colors.light;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: c.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    position: "relative",
  },
  authCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: c.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
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
  stripeSegment: {
    flex: 1,
  },
  stripeRed: {
    backgroundColor: "#C94B4B",
  },
  stripeLight: {
    backgroundColor: "#F7F3E9",
  },
  stripeBlue: {
    backgroundColor: "#2F5F8F",
  },
  stripeGold: {
    backgroundColor: c.accent,
  },
  back: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 12,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: c.primary,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: c.secondary,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 8,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCopy: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 3,
  },
  content: {
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: -7,
  },
  methodOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  methodOptionSelected: {
    borderColor: c.primary,
    backgroundColor: c.secondary,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  methodCopy: {
    flex: 1,
    gap: 2,
  },
  methodTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  methodDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
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
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  button: {
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
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
  textButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  textButtonLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.primary,
  },
  successContent: {
    alignItems: "stretch",
    gap: 14,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
  },
  successTitle: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  successDescription: {
    textAlign: "center",
    marginTop: -6,
  },
});
