/**
 * Customer Profile — account info and logout.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const c = colors.light;

export default function CustomerProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
    >
      <Text style={styles.title}>Profilim</Text>

      {/* Avatar card */}
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.phone && (
          <View style={styles.phoneRow}>
            <Feather name="phone" size={14} color={c.mutedForeground} />
            <Text style={styles.phone}>{user.phone}</Text>
          </View>
        )}
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>Müşteri</Text>
        </View>
      </View>

      {/* Info section */}
      <View style={styles.section}>
        <InfoItem icon="user" label="Ad Soyad" value={user?.name || ""} />
        <InfoItem icon="mail" label="E-posta" value={user?.email || ""} />
        {user?.phone && <InfoItem icon="phone" label="Telefon" value={user.phone} />}
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() =>
          Alert.alert("Çıkış", "Hesabınızdan çıkmak istiyor musunuz?", [
            { text: "İptal", style: "cancel" },
            { text: "Çıkış Yap", style: "destructive", onPress: async () => { await logout(); router.replace("/"); } },
          ])
        }
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={18} color={c.destructive} />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoItem({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Feather name={icon} size={18} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground, paddingHorizontal: 20, paddingVertical: 16 },
  card: {
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 28,
    borderWidth: 1,
    borderColor: c.border,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground },
  email: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phone: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  roleBadge: {
    backgroundColor: c.secondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 4,
  },
  roleBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.primary },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  infoValue: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.foreground, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: colors.radius,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.destructive },
});
