import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { AuthBackgroundTexture } from "@/components/AuthBackgroundTexture";
import colors from "@/constants/colors";
import { Alert } from "@/utils/alert";
import {
  isTurkishMobilePhone,
  sanitizeTurkishMobilePhone,
} from "@/utils/phone";

type Role = "barber" | "customer";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const qrCode = /^\d{6}$/.test(rawCode ?? "") ? rawCode : undefined;
  const { setAuth } = useAuth();
  const [role, setRole] = useState<Role>("customer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [authorizedFirstName, setAuthorizedFirstName] = useState("");
  const [authorizedLastName, setAuthorizedLastName] = useState("");
  const [address, setAddress] = useState("");
  const [registrationError, setRegistrationError] = useState("");

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async (data) => {
        setRegistrationError("");
        await setAuth(data.token, data.user as any);
        if (data.user.role === "barber") {
          router.replace("/(barber)");
        } else if (qrCode) {
          router.replace({
            pathname: "/(customer)/barbers",
            params: { code: qrCode },
          });
        } else {
          router.replace("/(customer)");
        }
      },
      onError: (err: any) => {
        const message = err?.data?.error || "Kayıt başarısız";
        setRegistrationError(message);
        Alert.alert("Kayıt tamamlanamadı", message);
      },
    },
  });

  const handleRegister = () => {
    if (registerMutation.isPending) return;
    setRegistrationError("");
    if (role === "customer" && (!firstName.trim() || !lastName.trim())) {
      Alert.alert("Hata", "Ad ve soyad zorunludur");
      return;
    }
    if (
      role === "barber" &&
      (!businessName.trim() ||
        !authorizedFirstName.trim() ||
        !authorizedLastName.trim() ||
        !address.trim())
    ) {
      Alert.alert(
        "Hata",
        "İşletme adı, yetkili adı, yetkili soyadı ve açık adres zorunludur",
      );
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      Alert.alert("Hata", "Geçerli bir e-posta adresi girin");
      return;
    }
    if (!isTurkishMobilePhone(phone)) {
      Alert.alert(
        "Hata",
        "Telefon numarası 5 ile başlayan 10 haneli bir numara olmalı",
      );
      return;
    }
    if (password.length < 6 || password.length > 72) {
      Alert.alert("Hata", "Şifre 6-72 karakter arasında olmalı");
      return;
    }

    const account = {
      email: email.trim().toLowerCase(),
      password,
      phone,
    };

    if (role === "customer") {
      registerMutation.mutate({
        data: {
          ...account,
          role: "customer",
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      });
      return;
    }

    registerMutation.mutate({
      data: {
        ...account,
        role: "barber",
        businessName: businessName.trim(),
        authorizedFirstName: authorizedFirstName.trim(),
        authorizedLastName: authorizedLastName.trim(),
        address: address.trim(),
      },
    });
  };

  const c = colors.light;

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
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Feather name="chevron-left" size={18} color={c.primary} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="user-plus" size={22} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Kayıt Ol</Text>
            <Text style={styles.subtitle}>Hesabınızı oluşturun</Text>
          </View>
        </View>

        {/* Role selector */}
        <View style={styles.roleRow}>
          {(["customer", "barber"] as Role[]).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.roleBtn, role === r && styles.roleBtnActive]}
              onPress={() => setRole(r)}
              activeOpacity={0.7}
            >
              <Feather
                name={r === "customer" ? "user" : "scissors"}
                size={17}
                color={role === r ? c.primaryForeground : c.mutedForeground}
              />
              <Text
                style={[
                  styles.roleBtnText,
                  role === r && styles.roleBtnTextActive,
                ]}
              >
                {r === "customer" ? "Müşteri" : "Berber"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {role === "customer" ? (
          <>
            <Field
              label="Ad"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Ali"
              autoComplete="given-name"
              maxLength={100}
            />
            <Field
              label="Soyad"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Yılmaz"
              autoComplete="family-name"
              maxLength={100}
            />
          </>
        ) : (
          <>
            <Field
              label="İşletme Adı"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Örnek Berber Salonu"
              autoComplete="organization"
              maxLength={160}
            />
            <Field
              label="Yetkili Adı"
              value={authorizedFirstName}
              onChangeText={setAuthorizedFirstName}
              placeholder="Ali"
              autoComplete="given-name"
              maxLength={100}
            />
            <Field
              label="Yetkili Soyadı"
              value={authorizedLastName}
              onChangeText={setAuthorizedLastName}
              placeholder="Yılmaz"
              autoComplete="family-name"
              maxLength={100}
            />
            <Field
              label="Açık Adres"
              value={address}
              onChangeText={setAddress}
              placeholder="Mahalle, cadde, sokak, bina no, ilçe/il"
              autoComplete="street-address"
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </>
        )}
        <Field
          label="E-posta"
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@mail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          maxLength={254}
        />
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Telefon Numarası</Text>
          <View style={styles.phoneInput}>
            <TextInput
              style={styles.phoneField}
              value={phone}
              onChangeText={(text) =>
                setPhone(sanitizeTurkishMobilePhone(text))
              }
              placeholder="5551112233"
              placeholderTextColor={c.mutedForeground}
              keyboardType="number-pad"
              autoCapitalize="none"
              maxLength={10}
              autoComplete="tel"
            />
          </View>
        </View>
        <Field
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          placeholder="En az 6 karakter"
          secureTextEntry
          maxLength={72}
          autoCapitalize="none"
          autoComplete="new-password"
        />

        {registrationError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Feather name="alert-circle" size={18} color={c.destructive} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Kayıt tamamlanamadı</Text>
              <Text style={styles.errorText}>{registrationError}</Text>
              {registrationError.includes("kullanılıyor") ? (
                <TouchableOpacity onPress={() => router.replace("/login")}>
                  <Text style={styles.loginLink}>Giriş yapmaya git</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.button,
            registerMutation.isPending && styles.buttonDisabled,
          ]}
          onPress={handleRegister}
          disabled={registerMutation.isPending}
          activeOpacity={0.8}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Kayıt Ol</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  maxLength,
  autoCorrect,
  autoComplete,
  multiline,
  numberOfLines,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  maxLength?: number;
  autoCorrect?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  multiline?: boolean;
  numberOfLines?: number;
}) {
  const c = colors.light;
  return (
    <View style={{ gap: 6, marginBottom: 4, paddingHorizontal: 20 }}>
      <Text
        style={{
          fontSize: 13,
          fontFamily: "Inter_500Medium",
          color: c.mutedForeground,
        }}
      >
        {label}
      </Text>
      <TextInput
        style={{
          backgroundColor: c.background,
          borderRadius: colors.radius,
          paddingHorizontal: 16,
          paddingVertical: 13,
          fontSize: 15,
          fontFamily: "Inter_400Regular",
          color: c.foreground,
          borderWidth: 1,
          borderColor: c.border,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "words"}
        maxLength={maxLength}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

const c = colors.light;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    position: "relative",
  },
  authCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: c.card,
    borderRadius: 24,
    gap: 13,
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
  stripeSegment: { flex: 1 },
  stripeRed: { backgroundColor: "#C94B4B" },
  stripeLight: { backgroundColor: "#F7F3E9" },
  stripeBlue: { backgroundColor: "#2F5F8F" },
  stripeGold: { backgroundColor: c.accent },
  back: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  backText: { fontSize: 15, fontFamily: "Inter_500Medium", color: c.primary },
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
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: c.primary },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 2,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  inputGroup: { gap: 6, marginBottom: 4, paddingHorizontal: 20 },
  phoneInput: {
    backgroundColor: c.background,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  phoneField: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  roleBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 13,
    borderRadius: colors.radius,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  roleBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  roleBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.secondaryForeground,
  },
  roleBtnTextActive: {
    color: c.primaryForeground,
  },
  button: {
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: c.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.destructive + "35",
    backgroundColor: c.destructive + "0D",
  },
  errorCopy: { flex: 1, minWidth: 0 },
  errorTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: c.destructive,
  },
  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
  },
  loginLink: {
    marginTop: 7,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: c.primaryForeground,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
