/**
 * Booking screen — customer picks a date and time slot.
 * Trendyol-style: horizontal day scroll + slot buttons.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
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

const c = colors.light;

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

  const { data: barber, isLoading: barberLoading } = useGetBarber(
    Number(barberId),
  );

  const { data: slots, isLoading: slotsLoading } = useGetBarberSlots(
    Number(barberId),
    { date: selectedDate },
    {
      query: {
        enabled: !!barberId,
        queryKey: getGetBarberSlotsQueryKey(Number(barberId), { date: selectedDate }),
      },
    },
  );

  const createAppt = useCreateAppointment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetUpcomingAppointmentsQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: ["getBarberSlots"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Randevu Alındı", "Randevunuz başarıyla oluşturuldu!", [
          { text: "Tamam", onPress: () => router.back() },
        ]);
      },
      onError: (err: any) => {
        Alert.alert("Hata", err?.data?.error || "Randevu alınamadı");
      },
    },
  });

  const todayStr = new Date().toISOString().split("T")[0]!;
  const currentHour = new Date().getHours();

  // A slot is "past" if it's today and its start hour has already passed
  const isPastSlot = (startTime: string) => {
    if (selectedDate !== todayStr) return false;
    const slotHour = parseInt(startTime.split(":")[0]!, 10);
    return slotHour < currentHour;
  };

  // Show all barber-opened slots: available ones selectable, booked ones shown as "Dolu"
  const displaySlots = (slots ?? []).filter((s) => s.isAvailable);

  const handleBook = () => {
    if (!selectedSlotId) {
      Alert.alert("Uyarı", "Lütfen bir saat seçin");
      return;
    }
    Alert.alert(
      "Randevu Onayla",
      `${selectedDate} tarihinde randevu almak istediğinizden emin misiniz?`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Onayla",
          onPress: () => createAppt.mutate({ data: { slotId: selectedSlotId } }),
        },
      ],
    );
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
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
              <TouchableOpacity
                key={d}
                style={[styles.dayBtn, isSelected && styles.dayBtnActive]}
                onPress={() => {
                  setSelectedDate(d);
                  setSelectedSlotId(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{day}</Text>
                <Text style={[styles.dayDate, isSelected && styles.dayDateActive]}>{date}</Text>
                <Text style={[styles.dayMonth, isSelected && styles.dayMonthActive]}>{month}</Text>
              </TouchableOpacity>
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
                <TouchableOpacity
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
                  activeOpacity={isDisabled ? 1 : 0.7}
                  disabled={isDisabled}
                >
                  {/* Time */}
                  <View style={styles.slotTimeCol}>
                    <Text style={[
                      styles.slotTime,
                      isBooked && styles.slotTimeBooked,
                      isPast && !isBooked && styles.slotTimePast,
                      !isDisabled && isSelected && styles.slotTimeSelected,
                    ]}>
                      {slot.startTime}
                    </Text>
                    <Text style={[
                      styles.slotEndTime,
                      isBooked && styles.slotTimeBooked,
                      isPast && !isBooked && styles.slotTimePast,
                      !isDisabled && isSelected && styles.slotTimeSelected,
                    ]}>
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
                </TouchableOpacity>
              );
            }}
          />
        )}
      </ScrollView>

      {/* Book button */}
      <TouchableOpacity
        style={[
          styles.bookBtn,
          (!selectedSlotId || createAppt.isPending) && styles.bookBtnDisabled,
        ]}
        onPress={handleBook}
        disabled={!selectedSlotId || createAppt.isPending}
        activeOpacity={0.8}
      >
        {createAppt.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.bookBtnText}>
            {selectedSlotId ? "Randevu Al" : "Saat Seçin"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.background },
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
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: c.foreground },
  barberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  shopName: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
  barberName: { fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  address: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
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
  dayName: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  dayNameActive: { color: "rgba(255,255,255,0.8)" },
  dayDate: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
  dayDateActive: { color: "#fff" },
  dayMonth: { fontSize: 10, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  dayMonthActive: { color: "rgba(255,255,255,0.7)" },
  slotGrid: { paddingHorizontal: 16, gap: 8, paddingBottom: 20 },
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
  },
  slotSelected: { backgroundColor: c.primary + "15", borderColor: c.primary },
  slotBooked: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  slotPast:   { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  slotTimeCol: { width: 60 },
  slotTime: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
  slotEndTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 1 },
  slotTimeSelected: { color: c.primary },
  slotTimeBooked: { color: "#EF4444" },
  slotTimePast:   { color: "#9CA3AF" },
  badgeOpen: {
    flex: 1,
    backgroundColor: "#D1FAE5",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeOpenText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#059669" },
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
  badgeSelectedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  badgeBooked: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeBookedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  badgePast: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgePastText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#9CA3AF" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  bookBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: "center",
  },
  bookBtnDisabled: { opacity: 0.5 },
  bookBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
