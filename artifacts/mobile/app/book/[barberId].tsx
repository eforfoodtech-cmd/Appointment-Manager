/**
 * Booking screen — customer picks a date and time slot.
 * Trendyol-style: horizontal day scroll + slot buttons.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetBarber,
  useGetBarberSlots,
  useCreateAppointment,
  getGetBarberSlotsQueryKey,
  getGetUpcomingAppointmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import { PressableScale } from "@/components/PressableScale";

const c = colors.light;

type BookingSlot = {
  id: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  isBooked: boolean;
};

function getNext7Days() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
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

export default function BookingScreen() {
  const { barberId } = useLocalSearchParams<{ barberId: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const days = getNext7Days();
  const [selectedDate, setSelectedDate] = useState(days[0]!);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const { data: barber, isLoading: barberLoading } = useGetBarber(
    Number(barberId),
  );

  const { data: slots, isLoading: slotsLoading } = useGetBarberSlots(
    Number(barberId),
    { date: selectedDate },
    {
      query: {
        enabled: !!barberId,
        queryKey: getGetBarberSlotsQueryKey(Number(barberId), {
          date: selectedDate,
        }),
        staleTime: 0,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  );

  const createAppt = useCreateAppointment({
    mutation: {
      onSuccess: () => {
        setConfirmVisible(false);
        queryClient.invalidateQueries({
          queryKey: getGetUpcomingAppointmentsQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetBarberSlotsQueryKey(Number(barberId), {
            date: selectedDate,
          }),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSuccessVisible(true);
      },
      onError: (err: any) => {
        Alert.alert("Hata", err?.data?.error || "Randevu alınamadı");
      },
    },
  });

  function getNowIstanbul() {
    const str = new Date().toLocaleString("sv-SE", {
      timeZone: "Europe/Istanbul",
    });
    const [datePart, timePart] = str.split(" ");
    const [hStr, mStr] = (timePart ?? "00:00").split(":");
    return {
      date: datePart ?? "",
      minutes: parseInt(hStr ?? "0", 10) * 60 + parseInt(mStr ?? "0", 10),
    };
  }

  const { date: todayStr, minutes: nowMinutes } = getNowIstanbul();

  // A slot is "past" if selectedDate < today OR it's today and startTime <= now (Istanbul)
  const isPastSlot = (startTime: string) => {
    if (selectedDate > todayStr) return false;
    if (selectedDate < todayStr) return true;
    const [h, m] = startTime.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0) <= nowMinutes;
  };

  // Show all barber-opened slots: available ones selectable, booked ones shown as "Dolu"
  const displaySlots = ((slots ?? []) as BookingSlot[]).filter(
    (s) => s.isAvailable,
  );
  const selectedSlot = displaySlots.find((s) => s.id === selectedSlotId);
  const selectedDateLabel = new Date(
    selectedDate + "T12:00:00",
  ).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleBook = () => {
    if (!selectedSlotId) {
      Alert.alert("Uyarı", "Lütfen bir saat seçin");
      return;
    }
    setConfirmVisible(true);
  };

  if (barberLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      {/* Barber info */}
      <View style={styles.barberCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {barber?.name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={styles.shopName}>{barber?.shopName}</Text>
          <Text style={styles.barberName}>{barber?.name}</Text>
          {barber?.shopAddress && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 2,
              }}
            >
              <Feather name="map-pin" size={12} color={c.mutedForeground} />
              <Text style={styles.address}>{barber.shopAddress}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Day selector */}
        <Text style={styles.sectionLabel}>Tarih Seçin</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysRow}
        >
          {days.map((d) => {
            const { day, date, month } = formatDay(d);
            const isSelected = d === selectedDate;
            return (
              <PressableScale
                key={d}
                style={[styles.dayBtn, isSelected && styles.dayBtnActive]}
                onPress={() => {
                  setSelectedDate(d);
                  setSelectedSlotId(null);
                }}
                scaleTo={0.95}
              >
                <Text
                  style={[styles.dayName, isSelected && styles.dayNameActive]}
                >
                  {day}
                </Text>
                <Text
                  style={[styles.dayDate, isSelected && styles.dayDateActive]}
                >
                  {date}
                </Text>
                <Text
                  style={[styles.dayMonth, isSelected && styles.dayMonthActive]}
                >
                  {month}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* Time slots */}
        <Text style={styles.sectionLabel}>Saat Seçin</Text>

        {slotsLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
        ) : !displaySlots.length ? (
          <View style={styles.empty}>
            <Feather name="clock" size={36} color={c.border} />
            <Text style={styles.emptyText}>Bu gün için müsait saat yok</Text>
          </View>
        ) : (
          <FlatList
            data={displaySlots}
            keyExtractor={(s) => String(s.id)}
            scrollEnabled={false}
            contentContainerStyle={styles.slotGrid}
            renderItem={({ item: slot }) => {
              const isSelected = slot.id === selectedSlotId;
              const isBooked = slot.isBooked;
              const isPast = isPastSlot(slot.startTime);
              const isDisabled = isBooked || isPast;
              return (
                <PressableScale
                  style={[
                    styles.slot,
                    isBooked && styles.slotBooked,
                    isPast && !isBooked && styles.slotPast,
                    !isDisabled && isSelected && styles.slotSelected,
                  ]}
                  onPress={() => {
                    if (isDisabled) return;
                    setSelectedSlotId(isSelected ? null : slot.id);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  disabled={isDisabled}
                  scaleTo={0.985}
                >
                  {/* Time */}
                  <View style={styles.slotTimeCol}>
                    <Text
                      style={[
                        styles.slotTime,
                        isBooked && styles.slotTimeBooked,
                        isPast && !isBooked && styles.slotTimePast,
                        !isDisabled && isSelected && styles.slotTimeSelected,
                      ]}
                    >
                      {slot.startTime}
                    </Text>
                    <Text
                      style={[
                        styles.slotEndTime,
                        isBooked && styles.slotTimeBooked,
                        isPast && !isBooked && styles.slotTimePast,
                        !isDisabled && isSelected && styles.slotTimeSelected,
                      ]}
                    >
                      {slot.endTime}
                    </Text>
                  </View>

                  {/* Status / selection */}
                  {isBooked ? (
                    <View style={styles.badgeBooked}>
                      <Text style={styles.badgeBookedText}>Dolu</Text>
                    </View>
                  ) : isPast ? (
                    <View style={styles.badgePast}>
                      <Text style={styles.badgePastText}>Geçti</Text>
                    </View>
                  ) : isSelected ? (
                    <View style={styles.badgeSelected}>
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.badgeSelectedText}>Seçildi</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeOpen}>
                      <Text style={styles.badgeOpenText}>Müsait</Text>
                    </View>
                  )}
                </PressableScale>
              );
            }}
          />
        )}
      </ScrollView>

      {/* Book button */}
      <PressableScale
        style={[
          styles.bookBtn,
          (!selectedSlotId || createAppt.isPending) && styles.bookBtnDisabled,
        ]}
        onPress={handleBook}
        disabled={!selectedSlotId || createAppt.isPending}
        scaleTo={0.985}
      >
        {createAppt.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.bookBtnText}>
            {selectedSlotId ? "Randevu Al" : "Saat Seçin"}
          </Text>
        )}
      </PressableScale>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.confirmBackdrop}
            onPress={() => {
              if (!createAppt.isPending) setConfirmVisible(false);
            }}
          />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Feather name="calendar" size={22} color={c.accent} />
            </View>
            <Text style={styles.confirmTitle}>Randevu Onayı</Text>
            <Text style={styles.confirmSubtitle}>
              Bilgileri kontrol edip randevunu oluştur.
            </Text>

            <View style={styles.confirmSummary}>
              <View style={styles.confirmRow}>
                <Feather name="scissors" size={16} color={c.primary} />
                <View style={styles.confirmRowText}>
                  <Text style={styles.confirmLabel}>İşletme</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>
                    {barber?.shopName}
                  </Text>
                </View>
              </View>
              <View style={styles.confirmRow}>
                <Feather name="calendar" size={16} color={c.primary} />
                <View style={styles.confirmRowText}>
                  <Text style={styles.confirmLabel}>Tarih</Text>
                  <Text style={styles.confirmValue}>{selectedDateLabel}</Text>
                </View>
              </View>
              <View style={styles.confirmRow}>
                <Feather name="clock" size={16} color={c.primary} />
                <View style={styles.confirmRowText}>
                  <Text style={styles.confirmLabel}>Saat</Text>
                  <Text style={styles.confirmValue}>
                    {selectedSlot
                      ? `${selectedSlot.startTime} - ${selectedSlot.endTime}`
                      : "Saat seçilmedi"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <PressableScale
                style={styles.confirmCancel}
                onPress={() => setConfirmVisible(false)}
                disabled={createAppt.isPending}
              >
                <Text style={styles.confirmCancelText}>Vazgeç</Text>
              </PressableScale>
              <PressableScale
                style={styles.confirmPrimary}
                onPress={() => {
                  if (!selectedSlotId) return;
                  createAppt.mutate({ data: { slotId: selectedSlotId } });
                }}
                disabled={createAppt.isPending || !selectedSlotId}
              >
                {createAppt.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>Onayla</Text>
                )}
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSuccessVisible(false);
          router.back();
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, styles.successIcon]}>
              <Feather name="check" size={24} color={c.success} />
            </View>
            <Text style={styles.confirmTitle}>Randevu Alındı</Text>
            <Text style={styles.confirmSubtitle}>
              Randevun başarıyla oluşturuldu.
            </Text>
            <PressableScale
              style={styles.successButton}
              onPress={() => {
                setSuccessVisible(false);
                router.back();
              }}
              scaleTo={0.985}
            >
              <Text style={styles.confirmPrimaryText}>Tamam</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  barberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 17,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.primary },
  shopName: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
  barberName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  address: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
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
  dayName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  dayNameActive: { color: "rgba(255,255,255,0.8)" },
  dayDate: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
  dayDateActive: { color: "#fff" },
  dayMonth: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  dayMonthActive: { color: "rgba(255,255,255,0.7)" },
  slotGrid: { paddingHorizontal: 16, gap: 8, paddingBottom: 100 },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: c.border,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  slotSelected: { backgroundColor: c.primary + "15", borderColor: c.primary },
  slotBooked: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  slotPast: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  slotTimeCol: { width: 60 },
  slotTime: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
  slotEndTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 1,
  },
  slotTimeSelected: { color: c.primary },
  slotTimeBooked: { color: "#9CA3AF" },
  slotTimePast: { color: "#9CA3AF" },
  badgeOpen: {
    flex: 1,
    backgroundColor: "#D1FAE5",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeOpenText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  badgeSelected: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.primary,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeSelectedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  badgeBooked: {
    flex: 1,
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeBookedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
  },
  badgePast: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgePastText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#9CA3AF",
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  bookBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  bookBtnDisabled: { opacity: 0.5 },
  bookBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(30,37,34,0.48)",
  },
  confirmBackdrop: { ...StyleSheet.absoluteFillObject },
  confirmCard: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: c.primary + "12",
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  successIcon: { backgroundColor: c.success + "12" },
  confirmTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  confirmSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 4,
    marginBottom: 16,
  },
  confirmSummary: {
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
    overflow: "hidden",
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  confirmRowText: { flex: 1, minWidth: 0 },
  confirmLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
    marginBottom: 2,
  },
  confirmValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
    textTransform: "capitalize",
  },
  confirmActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  confirmCancel: {
    flex: 1,
    borderRadius: colors.radius,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmCancelText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  confirmPrimary: {
    flex: 1,
    borderRadius: colors.radius,
    backgroundColor: c.primary,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  confirmPrimaryText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  successButton: {
    borderRadius: colors.radius,
    backgroundColor: c.primary,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
    shadowColor: c.primary,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
});
