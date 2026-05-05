/**
 * Barber Profile — edit shop info, manage weekly schedule template, and no-show blocks.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
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
  useGetMyAvailability,
  useSetMyAvailability,
  getGetMyBarberProfileQueryKey,
  getListBlocksQueryKey,
  getGetMyAvailabilityQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import type { AvailabilityInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import colors from "@/constants/colors";

const c = colors.light;

const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DURATION_OPTIONS = [30, 45, 60, 90];

const DEFAULT_TEMPLATE: AvailabilityInput[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  startTime: "10:00",
  endTime: "22:00",
  isOpen: d >= 1 && d <= 6, // Mon–Sat open, Sun closed
  slotDuration: 60,
}));

type DayRow = {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
  slotDuration: number;
};

export default function BarberProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { showToast, ToastComponent } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);

  const { data: profile, isLoading } = useGetMyBarberProfile();
  const { data: blocks } = useListBlocks();
  const { data: availabilityData } = useGetMyAvailability();

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [bio, setBio] = useState("");

  // Weekly schedule state — 7 rows, one per day
  const [schedule, setSchedule] = useState<DayRow[]>(
    DEFAULT_TEMPLATE.map((t) => ({ ...t })),
  );

  useEffect(() => {
    if (profile) {
      setShopName(profile.shopName);
      setShopAddress(profile.shopAddress || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  useEffect(() => {
    if (availabilityData && availabilityData.length > 0) {
      // Build a map from the server data, fill in defaults for missing days
      const map = new Map(availabilityData.map((a) => [a.dayOfWeek, a]));
      setSchedule(
        [0, 1, 2, 3, 4, 5, 6].map((d) => {
          const row = map.get(d);
          if (row) {
            return {
              dayOfWeek: d,
              isOpen: row.isOpen,
              startTime: row.startTime,
              endTime: row.endTime,
              slotDuration: row.slotDuration,
            };
          }
          return { ...DEFAULT_TEMPLATE[d]! };
        }),
      );
    }
  }, [availabilityData]);

  const updateProfile = useUpdateMyBarberProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyBarberProfileQueryKey() });
        setEditMode(false);
      },
      onError: (err: any) => Alert.alert("Hata", err?.data?.error || "Güncellenemedi"),
    },
  });

  const setAvailability = useSetMyAvailability({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyAvailabilityQueryKey() });
        setScheduleEditing(false);
        customFetch("/api/barbers/me/slots/seed-week", { method: "POST" })
          .then(() => queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] }))
          .catch(() => {});
        showToast("Haftalık program kaydedildi", "success");
      },
      onError: (err: any) =>
        showToast(err?.data?.error || "Program kaydedilemedi", "error"),
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
      queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey() });
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

  const handleSaveSchedule = () => {
    setAvailability.mutate({
      data: schedule.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        isOpen: row.isOpen,
        startTime: row.startTime,
        endTime: row.endTime,
        slotDuration: row.slotDuration,
      })),
    });
  };

  const updateDay = (dayOfWeek: number, patch: Partial<DayRow>) => {
    setSchedule((prev) =>
      prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)),
    );
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
    <View style={styles.container}>
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

      {/* Weekly Schedule Template */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Haftalık Program</Text>
          <TouchableOpacity
            style={[styles.scheduleEditBtn, scheduleEditing && styles.scheduleEditBtnActive]}
            onPress={() => (scheduleEditing ? handleSaveSchedule() : setScheduleEditing(true))}
            activeOpacity={0.8}
          >
            {setAvailability.isPending ? (
              <ActivityIndicator color={scheduleEditing ? "#fff" : c.primary} size="small" />
            ) : (
              <Text style={[styles.scheduleEditBtnText, scheduleEditing && styles.scheduleEditBtnTextActive]}>
                {scheduleEditing ? "Kaydet" : "Düzenle"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.scheduleHint}>
          Seed-week bu programa göre yeni günler oluşturur.
        </Text>

        {schedule.map((row) => (
          <DayScheduleRow
            key={row.dayOfWeek}
            row={row}
            editing={scheduleEditing}
            onUpdate={(patch) => updateDay(row.dayOfWeek, patch)}
          />
        ))}

        {scheduleEditing && (
          <TouchableOpacity
            style={styles.cancelScheduleBtn}
            onPress={() => {
              setScheduleEditing(false);
              // Revert to server data
              if (availabilityData && availabilityData.length > 0) {
                const map = new Map(availabilityData.map((a) => [a.dayOfWeek, a]));
                setSchedule(
                  [0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const r = map.get(d);
                    return r ? { dayOfWeek: d, isOpen: r.isOpen, startTime: r.startTime, endTime: r.endTime, slotDuration: r.slotDuration } : { ...DEFAULT_TEMPLATE[d]! };
                  }),
                );
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelScheduleBtnText}>İptal</Text>
          </TouchableOpacity>
        )}
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
    {ToastComponent}
    </View>
  );
}

function DayScheduleRow({
  row,
  editing,
  onUpdate,
}: {
  row: DayRow;
  editing: boolean;
  onUpdate: (patch: Partial<DayRow>) => void;
}) {
  return (
    <View style={[styles.dayRow, !row.isOpen && styles.dayRowClosed]}>
      <View style={styles.dayRowHeader}>
        <Text style={[styles.dayName, !row.isOpen && styles.dayNameClosed]}>
          {DAY_NAMES[row.dayOfWeek]}
        </Text>
        {editing ? (
          <Switch
            value={row.isOpen}
            onValueChange={(v) => onUpdate({ isOpen: v })}
            trackColor={{ false: c.border, true: c.primary + "80" }}
            thumbColor={row.isOpen ? c.primary : c.mutedForeground}
          />
        ) : (
          <View style={[styles.dayStatusBadge, row.isOpen ? styles.dayStatusOpen : styles.dayStatusClosed]}>
            <Text style={[styles.dayStatusText, row.isOpen ? styles.dayStatusOpenText : styles.dayStatusClosedText]}>
              {row.isOpen ? "Açık" : "Kapalı"}
            </Text>
          </View>
        )}
      </View>

      {row.isOpen && (
        <View style={styles.dayRowDetails}>
          {editing ? (
            <>
              <View style={styles.timeFieldRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeFieldLabel}>Açılış</Text>
                  <TextInput
                    style={styles.timeFieldInput}
                    value={row.startTime}
                    onChangeText={(v) => onUpdate({ startTime: v })}
                    placeholder="09:00"
                    placeholderTextColor={c.mutedForeground}
                  />
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.timeFieldLabel}>Kapanış</Text>
                  <TextInput
                    style={styles.timeFieldInput}
                    value={row.endTime}
                    onChangeText={(v) => onUpdate({ endTime: v })}
                    placeholder="22:00"
                    placeholderTextColor={c.mutedForeground}
                  />
                </View>
              </View>
              <View style={styles.durationRow}>
                <Text style={styles.timeFieldLabel}>Slot süresi</Text>
                <View style={styles.durationOptions}>
                  {DURATION_OPTIONS.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.durationBtn, row.slotDuration === d && styles.durationBtnActive]}
                      onPress={() => onUpdate({ slotDuration: d })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationBtnText, row.slotDuration === d && styles.durationBtnTextActive]}>
                        {d}dk
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.dayRowSummary}>
              {row.startTime} – {row.endTime} · {row.slotDuration} dk
            </Text>
          )}
        </View>
      )}
    </View>
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 16 },
  scheduleHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginBottom: 14,
    marginTop: -10,
  },
  scheduleEditBtn: {
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  scheduleEditBtnActive: { backgroundColor: c.primary },
  scheduleEditBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.primary },
  scheduleEditBtnTextActive: { color: "#fff" },
  cancelScheduleBtn: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelScheduleBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },

  // Day rows
  dayRow: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  dayRowClosed: { opacity: 0.6 },
  dayRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
  dayNameClosed: { color: c.mutedForeground },
  dayStatusBadge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  dayStatusOpen: { backgroundColor: "#D1FAE5" },
  dayStatusClosed: { backgroundColor: c.secondary },
  dayStatusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dayStatusOpenText: { color: "#059669" },
  dayStatusClosedText: { color: c.mutedForeground },

  dayRowDetails: { paddingBottom: 8, gap: 10 },
  dayRowSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    paddingBottom: 4,
  },
  timeFieldRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1, gap: 4 },
  timeFieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  timeFieldInput: {
    backgroundColor: c.secondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
    textAlign: "center",
  },
  durationRow: { gap: 6 },
  durationOptions: { flexDirection: "row", gap: 8 },
  durationBtn: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: c.background,
  },
  durationBtnActive: { borderColor: c.primary, backgroundColor: c.primary + "15" },
  durationBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: c.foreground },
  durationBtnTextActive: { color: c.primary, fontFamily: "Inter_700Bold" },

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
