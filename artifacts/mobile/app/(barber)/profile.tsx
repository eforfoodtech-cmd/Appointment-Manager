/**
 * Barber Profile — edit shop info and manage no-show blocks.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetMyBarberProfile,
  useUpdateMyBarberProfile,
  useListBlocks,
  useRemoveBlock,
  getGetMyBarberProfileQueryKey,
  getListBlocksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const c = colors.light;

export default function BarberProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const { data: profile, isLoading } = useGetMyBarberProfile();
  const { data: blocks } = useListBlocks();

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (profile) {
      setShopName(profile.shopName);
      setShopAddress(profile.shopAddress || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  const updateProfile = useUpdateMyBarberProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyBarberProfileQueryKey() });
        setEditMode(false);
      },
      onError: (err: any) => Alert.alert("Hata", err?.data?.error || "Güncellenemedi"),
    },
  });

  const removeBlock = useRemoveBlock();

  const handleRemoveBlock = async (blockId: number) => {
    try {
      await removeBlock.mutateAsync({ blockId });
      queryClient.setQueryData(
        getListBlocksQueryKey(),
        (old: any[] | undefined) => old?.filter((b) => b.id !== blockId) ?? [],
      );
      await queryClient.refetchQueries({ queryKey: getListBlocksQueryKey() });
    } catch (err: any) {
      Alert.alert("Hata", err?.data?.error || "Engel kaldırılamadı");
    }
  };

  const handleSave = () => {
    if (!shopName.trim()) {
      Alert.alert("Hata", "İşletme adı zorunludur");
      return;
    }
    updateProfile.mutate({
      data: {
        shopName: shopName.trim(),
        shopAddress: shopAddress.trim() || undefined,
        bio: bio.trim() || undefined,
      },
    });
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Profilim</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => (editMode ? handleSave() : setEditMode(true))}
          activeOpacity={0.8}
        >
          {updateProfile.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name={editMode ? "check" : "edit-2"} size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Profile card */}
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Shop info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>İşletme Bilgileri</Text>

        <InfoRow
          label="İşletme Adı"
          value={shopName}
          onChange={setShopName}
          editable={editMode}
        />
        <InfoRow
          label="Adres"
          value={shopAddress}
          onChange={setShopAddress}
          editable={editMode}
          placeholder="İlçe, Şehir"
        />
        <InfoRow
          label="Biyografi"
          value={bio}
          onChange={setBio}
          editable={editMode}
          placeholder="Kendinizden bahsedin..."
          multiline
        />
      </View>

      {/* No-show blocks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Engellenen Müşteriler</Text>
        {!blocks?.length ? (
          <Text style={styles.noBlocks}>Engellenmiş müşteri yok</Text>
        ) : (
          blocks.map((block) => (
            <View key={block.id} style={styles.blockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockName}>{block.customerName}</Text>
                {block.reason && (
                  <Text style={styles.blockReason}>{block.reason}</Text>
                )}
                {block.expiresAt && (
                  <Text style={styles.blockExpiry}>
                    Bitiş: {new Date(block.expiresAt).toLocaleDateString("tr-TR")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert("Engeli Kaldır", "Bu müşterinin engelini kaldırmak ister misiniz?", [
                    { text: "İptal", style: "cancel" },
                    {
                      text: "Kaldır",
                      style: "destructive",
                      onPress: () => handleRemoveBlock(block.id),
                    },
                  ]);
                }}
              >
                <Feather name="x-circle" size={22} color={c.destructive} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => {
          Alert.alert("Çıkış", "Hesabınızdan çıkmak istiyor musunuz?", [
            { text: "İptal", style: "cancel" },
            {
              text: "Çıkış Yap",
              style: "destructive",
              onPress: async () => {
                await logout();
                if (Platform.OS === "web") {
                  // Most reliable on web: full page reload clears all state
                  (window as Window & typeof globalThis).location.href = "/";
                } else {
                  router.replace("/");
                }
              },
            },
          ]);
        }}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={18} color={c.destructive} />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  onChange,
  editable,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12, gap: 4 }}>
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: c.mutedForeground }}>{label}</Text>
      {editable ? (
        <TextInput
          style={{
            backgroundColor: c.secondary,
            borderRadius: colors.radius,
            paddingHorizontal: 14,
            paddingVertical: 11,
            fontSize: 15,
            fontFamily: "Inter_400Regular",
            color: c.foreground,
            borderWidth: 1,
            borderColor: c.border,
            ...(multiline && { height: 80, textAlignVertical: "top" }),
          }}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.mutedForeground}
          multiline={multiline}
        />
      ) : (
        <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: value ? c.foreground : c.mutedForeground }}>
          {value || placeholder || "—"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground },
  editBtn: {
    backgroundColor: c.primary,
    borderRadius: 20,
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  card: { alignItems: "center", paddingVertical: 24, gap: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground },
  email: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 16 },
  noBlocks: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 12,
  },
  blockName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
  blockReason: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  blockExpiry: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.warning },
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
