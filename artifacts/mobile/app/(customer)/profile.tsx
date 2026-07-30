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

  const completeLogout = async () => {
    await logout();
    if (Platform.OS === "web") {
      (window as Window & typeof globalThis).location.href = "/login";
    } else {
      router.replace("/login");
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (
        (window as Window & typeof globalThis).confirm(
          "Hesabinizdan cikmak istiyor musunuz?",
        )
      ) {
        void completeLogout();
      }
      return;
    }

    Alert.alert("Cikis", "Hesabinizdan cikmak istiyor musunuz?", [
      { text: "Iptal", style: "cancel" },
      {
        text: "Cikis Yap",
        style: "destructive",
        onPress: () => {
          void completeLogout();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerEyebrow}>Müşteri profili</Text>
          <Text style={styles.title}>Profilim</Text>
        </View>
        <View style={styles.headerBadge}>
          <Feather name="user" size={17} color={c.accent} />
        </View>
      </View>

      {/* Avatar card */}
      <View style={styles.card}>
        <View style={styles.profileTopRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileTextBlock}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>
        <View style={styles.profileMetaRow}>
          <View style={styles.rolePill}>
            <Feather name="user-check" size={13} color={c.accent} />
            <Text style={styles.rolePillText}>Müşteri</Text>
          </View>
          {user?.phone && (
            <View style={styles.rolePill}>
              <Feather name="phone" size={13} color={c.accent} />
              <Text style={styles.rolePillText}>{user.phone}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Info section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.sectionKicker}>Kişisel</Text>
          <Text style={styles.sectionTitle}>Hesap Bilgileri</Text>
        </View>
        <InfoItem icon="user" label="Ad Soyad" value={user?.name || ""} />
        <InfoItem icon="mail" label="E-posta" value={user?.email || ""} />
        <InfoItem
          icon="phone"
          label="Telefon"
          value={user?.phone || "Belirtilmemiş"}
        />
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={18} color={c.destructive} />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={17} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  headerTitleBlock: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    marginBottom: 3,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileTextBlock: { flex: 1, minWidth: 0 },
  profileMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rolePillText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.primary },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  email: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.78)",
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  sectionHeaderCompact: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.card,
  },
  sectionKicker: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: c.primary + "12",
    justifyContent: "center",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: colors.radius,
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#F4C7C7",
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.destructive,
  },
});
