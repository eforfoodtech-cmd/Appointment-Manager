/**
 * Barber Slots — manage appointment slots by date.
 * Single-column list + bulk default slot creation (10:00–22:00).
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetBarberSlots,
  useCreateSlot,
  useUpdateSlot,
  useDeleteSlot,
  getGetBarberSlotsQueryKey,
  useGetMyBarberProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";

const c = colors.light;

const DEFAULT_HOURS = Array.from({ length: 12 }, (_, i) => i + 10); // 10..21

function getNext14Days() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d.toISOString().split("T")[0]!);
  }
  return days;
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return {
    day: d.toLocaleDateString("tr-TR", { weekday: "short" }),
    date: d.getDate(),
    month: d.toLocaleDateString("tr-TR", { month: "short" }),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const days = getNext14Days();
  const [selectedDate, setSelectedDate] = useState(days[0]!);
  const [showModal, setShowModal] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false);

  const { data: profile } = useGetMyBarberProfile();
  const barberId = profile?.id;

  const { data: slots, isLoading } = useGetBarberSlots(
    barberId!,
    { date: selectedDate },
    {
      query: {
        enabled: !!barberId,
        queryKey: getGetBarberSlotsQueryKey(barberId!, { date: selectedDate }),
      },
    },
  );

  const createSlot = useCreateSlot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] });
        setShowModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (err: any) => Alert.alert("Hata", err?.data?.error || "Slot oluşturulamadı"),
    },
  });

  const updateSlot = useUpdateSlot({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] }),
    },
  });

  const deleteSlot = useDeleteSlot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      },
    },
  });

  const handleCreateSlot = () => {
    if (!startTime || !endTime) return;
    createSlot.mutate({
      data: { date: selectedDate, startTime, endTime, isAvailable: true },
    });
  };

  const handleCreateDefaultSlots = async () => {
    if (!barberId) return;
    setIsCreatingDefaults(true);
    try {
      for (const hour of DEFAULT_HOURS) {
        await createSlot.mutateAsync({
          data: {
            date: selectedDate,
            startTime: `${pad(hour)}:00`,
            endTime: `${pad(hour + 1)}:00`,
            isAvailable: true,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Hata", err?.data?.error || "Varsayılan slotlar oluşturulamadı");
    } finally {
      setIsCreatingDefaults(false);
    }
  };

  const handleToggle = (slotId: number, isAvailable: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSlot.mutate({ slotId, data: { isAvailable: !isAvailable } });
  };

  const handleDelete = (slotId: number, isBooked: boolean) => {
    if (isBooked) {
      Alert.alert("Uyarı", "Dolu slot silinemez");
      return;
    }
    Alert.alert("Sil", "Bu slotu silmek istediğinizden emin misiniz?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () => deleteSlot.mutate({ slotId }),
      },
    ]);
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { paddingTop }]}>
      {/* Title */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Slotlar</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Day selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {days.map((d) => {
          const { day, date, month } = formatDay(d);
          const isSelected = d === selectedDate;
          return (
            <TouchableOpacity
              key={d}
              style={[styles.dayBtn, isSelected && styles.dayBtnActive]}
              onPress={() => setSelectedDate(d)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{day}</Text>
              <Text style={[styles.dayDate, isSelected && styles.dayDateActive]}>{date}</Text>
              <Text style={[styles.dayMonth, isSelected && styles.dayMonthActive]}>{month}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Slots list */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <FlatList
          data={slots ?? []}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.slotList}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clock" size={40} color={c.border} />
              <Text style={styles.emptyText}>Bu gün için slot yok</Text>

              {/* Default slots button */}
              <TouchableOpacity
                style={[styles.defaultBtn, isCreatingDefaults && { opacity: 0.7 }]}
                onPress={handleCreateDefaultSlots}
                disabled={isCreatingDefaults}
                activeOpacity={0.8}
              >
                {isCreatingDefaults ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="zap" size={16} color="#fff" />
                    <Text style={styles.defaultBtnText}>Varsayılan Saatleri Ekle (10:00–22:00)</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          }
          ListHeaderComponent={
            slots && slots.length > 0 ? (
              <TouchableOpacity
                style={[styles.defaultBtnSmall, isCreatingDefaults && { opacity: 0.7 }]}
                onPress={handleCreateDefaultSlots}
                disabled={isCreatingDefaults}
                activeOpacity={0.8}
              >
                {isCreatingDefaults ? (
                  <ActivityIndicator color={c.primary} size="small" />
                ) : (
                  <>
                    <Feather name="zap" size={14} color={c.primary} />
                    <Text style={styles.defaultBtnSmallText}>Varsayılan Saatleri Ekle</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item: slot }) => (
            <View
              style={[
                styles.slotRow,
                slot.isBooked && styles.slotRowBooked,
                !slot.isAvailable && !slot.isBooked && styles.slotRowClosed,
              ]}
            >
              {/* Time */}
              <View style={styles.slotTimeCol}>
                <Text style={[
                  styles.slotTime,
                  slot.isBooked && styles.slotTimeBooked,
                  !slot.isAvailable && !slot.isBooked && styles.slotTimeClosed,
                ]}>
                  {slot.startTime}
                </Text>
                <Text style={[
                  styles.slotEndTime,
                  slot.isBooked && styles.slotTimeBooked,
                  !slot.isAvailable && !slot.isBooked && styles.slotTimeClosed,
                ]}>
                  {slot.endTime}
                </Text>
              </View>

              {/* Status badge */}
              {slot.isBooked ? (
                <View style={styles.badgeBooked}>
                  <Text style={styles.badgeBookedText}>Dolu</Text>
                </View>
              ) : slot.isAvailable ? (
                <View style={styles.badgeOpen}>
                  <Text style={styles.badgeOpenText}>Müsait</Text>
                </View>
              ) : (
                <View style={styles.badgeClosed}>
                  <Text style={styles.badgeClosedText}>Kapalı</Text>
                </View>
              )}

              {/* Actions */}
              {!slot.isBooked && (
                <View style={styles.slotActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleToggle(slot.id, slot.isAvailable)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={slot.isAvailable ? "eye" : "eye-off"}
                      size={18}
                      color={slot.isAvailable ? c.primary : c.mutedForeground}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleDelete(slot.id, slot.isBooked)}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={18} color={c.destructive} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Add slot modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Yeni Slot Ekle</Text>
            <Text style={styles.modalDate}>{selectedDate}</Text>

            <View style={styles.timeRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.modalLabel}>Başlangıç</Text>
                <TextInput
                  style={styles.timeInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                  placeholderTextColor={c.mutedForeground}
                />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.modalLabel}>Bitiş</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="10:00"
                  placeholderTextColor={c.mutedForeground}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, createSlot.isPending && { opacity: 0.7 }]}
                onPress={handleCreateSlot}
                disabled={createSlot.isPending}
              >
                {createSlot.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Ekle</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground },
  addBtn: {
    backgroundColor: c.primary,
    borderRadius: 20,
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  daysRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  dayBtn: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: colors.radius,
    backgroundColor: c.card,
    minWidth: 52,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  dayBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  dayName: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  dayNameActive: { color: "rgba(255,255,255,0.8)" },
  dayDate: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
  dayDateActive: { color: "#fff" },
  dayMonth: { fontSize: 10, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  dayMonthActive: { color: "rgba(255,255,255,0.7)" },

  slotList: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },

  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: c.border,
    gap: 12,
  },
  slotRowBooked: { backgroundColor: c.primary + "18", borderColor: c.primary + "60" },
  slotRowClosed: { backgroundColor: c.secondary, opacity: 0.75 },

  slotTimeCol: { width: 56 },
  slotTime: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground },
  slotEndTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 1 },
  slotTimeBooked: { color: c.primary },
  slotTimeClosed: { color: c.mutedForeground },

  badgeOpen: {
    flex: 1,
    backgroundColor: "#D1FAE5",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: "center",
  },
  badgeOpenText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#059669" },
  badgeBooked: {
    flex: 1,
    backgroundColor: c.primary + "20",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: "center",
  },
  badgeBookedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.primary },
  badgeClosed: {
    flex: 1,
    backgroundColor: c.secondary,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: "center",
  },
  badgeClosedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.mutedForeground },

  slotActions: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: c.background,
  },

  empty: { alignItems: "center", paddingVertical: 40, gap: 16 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium", color: c.mutedForeground },

  defaultBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  defaultBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  defaultBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: c.primary + "15",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.primary + "40",
  },
  defaultBtnSmallText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.primary },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: c.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground },
  modalDate: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  modalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  timeRow: { flexDirection: "row", gap: 12 },
  timeInput: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
    textAlign: "center",
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancel: {
    flex: 1,
    backgroundColor: c.secondary,
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
  modalConfirm: {
    flex: 1,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalConfirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
