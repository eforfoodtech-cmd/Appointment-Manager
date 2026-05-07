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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

type Role = "barber" | "customer";
const PIN_RE = /^\d{6}$/;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { setAuth } = useAuth();
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");

  const registerMutation = useRegister({
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
        Alert.alert("Hata", err?.data?.error || "Kayıt başarısız");
      },
    },
  });

  const handleRegister = () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Hata", "Ad, e-posta ve şifre zorunludur");
      return;
    }
    if (!PIN_RE.test(password)) {
      Alert.alert("Hata", "Şifre 6 haneli rakamlardan oluşmalı");
      return;
    }
    if (role === "barber" && !shopName.trim()) {
      Alert.alert("Hata", "Berber kaydı için işletme adı zorunludur");
      return;
    }

    registerMutation.mutate({
      data: {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        role,
        ...(role === "barber" && {
          shopName: shopName.trim(),
          shopAddress: shopAddress.trim() || undefined,
        }),
      },
    });
  };

  const c = colors.light;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Geri</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Kayıt Ol</Text>
      <Text style={styles.subtitle}>Hesabınızı oluşturun</Text>

      {/* Role selector */}
      <View style={styles.roleRow}>
        {(["customer", "barber"] as Role[]).map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.roleBtn, role === r && styles.roleBtnActive]}
            onPress={() => setRole(r)}
            activeOpacity={0.7}
          >
            <Text style={[styles.roleBtnText, role === r && styles.roleBtnTextActive]}>
              {r === "customer" ? "Müşteri" : "Berber"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Field label="Ad Soyad" value={name} onChangeText={setName} placeholder="Ali Yılmaz" />
      <Field label="E-posta" value={email} onChangeText={setEmail} placeholder="ali@email.com" keyboardType="email-address" autoCapitalize="none" />
      <Field label="Telefon (isteğe bağlı)" value={phone} onChangeText={setPhone} placeholder="05XX XXX XX XX" keyboardType="phone-pad" />
      <Field label="Şifre" value={password} onChangeText={setPassword} placeholder="6 haneli şifre" secureTextEntry keyboardType="number-pad" maxLength={6} />

      {role === "barber" && (
        <>
          <Field label="İşletme Adı" value={shopName} onChangeText={setShopName} placeholder="Salon adınız" />
          <Field label="Adres (isteğe bağlı)" value={shopAddress} onChangeText={setShopAddress} placeholder="İlçe, Şehir" />
        </>
      )}

      <TouchableOpacity
        style={[styles.button, registerMutation.isPending && styles.buttonDisabled]}
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  maxLength?: number;
}) {
  const c = colors.light;
  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: c.mutedForeground }}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: c.card,
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
        autoCapitalize={autoCapitalize || "words"}
        maxLength={maxLength}
      />
    </View>
  );
}

const c = colors.light;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  container: { paddingHorizontal: 24, gap: 12 },
  back: { marginBottom: 8 },
  backText: { fontSize: 15, fontFamily: "Inter_500Medium", color: c.primary },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.foreground },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginBottom: 4 },
  roleRow: { flexDirection: "row", gap: 12, marginBottom: 4 },
  roleBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: colors.radius,
    backgroundColor: c.secondary,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
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
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: c.primaryForeground, fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
