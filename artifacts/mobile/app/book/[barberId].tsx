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
  useListServices,
  getGetBarberSlotsQueryKey,
  getGetUpcomingAppointmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import { Alert } from "@/utils/alert";
import { PressableScale } from "@/components/PressableScale";
import { BarberMedia } from "@/components/AccountSettings";

const c = colors.light;

type BookingSlot = {
  id: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  isBooked: boolean;
};

type TimePeriodId = "morning" | "afternoon" | "evening";

const TIME_PERIODS: Array<{
  id: TimePeriodId;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  startHour: number;
  endHour: number;
}> = [
  { id: "morning", label: "Sabah", icon: "sunrise", startHour: 0, endHour: 12 },
  {
    id: "afternoon",
    label: "Öğleden sonra",
    icon: "sun",
    startHour: 12,
    endHour: 18,
  },
  { id: "evening", label: "Akşam", icon: "moon", startHour: 18, endHour: 24 },
];

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
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriodId>();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const services = useListServices(Number(barberId));
  const [serviceId, setServiceId] = useState<number | undefined>();
  const [bookingError, setBookingError] = useState("");
  const service = services.data?.find((item) => item.id === serviceId);

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
        setConfirmVisible(false);
        setBookingError(err?.data?.error || "Randevu alınamadı");
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
    (s) =>
      s.isAvailable &&
      (!service ||
        (() => {
          const minutes = (value: string) =>
            Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
          return (
            minutes(s.endTime) - minutes(s.startTime) >=
            service.durationMinutes + service.bufferMinutes
          );
        })()),
  );
  const periodOptions = TIME_PERIODS.map((period) => {
    const periodSlots = displaySlots.filter((slot) => {
      const hour = Number(slot.startTime.slice(0, 2));
      return hour >= period.startHour && hour < period.endHour;
    });
    return {
      ...period,
      count: periodSlots.length,
      availableCount: periodSlots.filter(
        (slot) => !slot.isBooked && !isPastSlot(slot.startTime),
      ).length,
    };
  }).filter((period) => period.count > 0);
  const activePeriod =
    periodOptions.find((period) => period.id === selectedPeriod) ??
    periodOptions.find((period) => period.availableCount > 0) ??
    periodOptions[0];
  const visibleSlots = activePeriod
    ? displaySlots.filter((slot) => {
        const hour = Number(slot.startTime.slice(0, 2));
        return hour >= activePeriod.startHour && hour < activePeriod.endHour;
      })
    : [];
  const selectedSlot = displaySlots.find((s) => s.id === selectedSlotId);
  const selectedDateLabel = new Date(
    selectedDate + "T12:00:00",
  ).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleBook = () => {
    setBookingError("");
    if (services.isLoading || services.isError) {
      setBookingError("Hizmet listesi yüklenemedi. Tekrar deneyin.");
      return;
    }
    if (services.data?.length && !service) {
      setBookingError("Lütfen bir hizmet seçin.");
      return;
    }
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
        <BarberMedia barberId={Number(barberId)} />
        <View style={styles.servicesHeading}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>1</Text>
          </View>
          <View style={styles.servicesHeadingText}>
            <Text style={styles.servicesTitle}>Hizmet seçin</Text>
            <Text style={styles.servicesSubtitle}>
              Randevunuz için bir hizmet belirleyin
            </Text>
          </View>
          {services.data?.length ? (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Zorunlu</Text>
            </View>
          ) : null}
        </View>
        {services.isLoading ? (
          <View style={styles.emptyServices}>
            <ActivityIndicator color={c.primary} />
            <Text style={styles.emptyServicesText}>Hizmetler yükleniyor…</Text>
          </View>
        ) : null}
        {services.data?.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              setServiceId(item.id);
              setSelectedSlotId(null);
              setBookingError("");
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: serviceId === item.id }}
            style={({ pressed }) => [
              styles.serviceCard,
              serviceId === item.id && styles.serviceCardSelected,
              pressed && styles.serviceCardPressed,
            ]}
          >
            <View
              style={[
                styles.serviceRadio,
                serviceId === item.id && styles.serviceRadioSelected,
              ]}
            >
              {serviceId === item.id ? (
                <Feather name="check" size={13} color="#fff" />
              ) : null}
            </View>
            <View style={styles.serviceInfo}>
              <View style={styles.serviceNameRow}>
                <Text
                  style={[
                    styles.serviceName,
                    serviceId === item.id && styles.serviceNameSelected,
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={styles.servicePrice}>
                  {(item.priceKurus / 100).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  ₺
                </Text>
              </View>
              {item.description ? (
                <Text style={styles.serviceDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.serviceMetaRow}>
                <Feather name="clock" size={13} color={c.mutedForeground} />
                <Text style={styles.serviceMetaText}>
                  {item.durationMinutes} dakika
                </Text>
                {item.bufferMinutes ? (
                  <>
                    <View style={styles.serviceMetaDot} />
                    <Text style={styles.serviceMetaText}>
                      {item.bufferMinutes} dk hazırlık
                    </Text>
                  </>
                ) : null}
                {serviceId === item.id ? (
                  <Text style={styles.serviceSelectedText}>Seçildi</Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        ))}
        {!services.isLoading &&
        !services.isError &&
        services.data?.length === 0 ? (
          <View style={styles.emptyServices}>
            <Feather name="scissors" size={24} color={c.mutedForeground} />
            <Text style={styles.emptyServicesTitle}>
              Henüz hizmet eklenmemiş
            </Text>
            <Text style={styles.emptyServicesText}>
              Bu işletme için hizmet seçenekleri daha sonra eklenecek.
            </Text>
          </View>
        ) : null}
        {services.isError ? (
          <View style={styles.emptyServices}>
            <Feather name="alert-circle" size={24} color={c.destructive} />
            <Text style={styles.emptyServicesTitle}>Hizmetler yüklenemedi</Text>
            <Pressable
              onPress={() => services.refetch()}
              style={styles.servicesRetryButton}
            >
              <Feather name="refresh-cw" size={14} color={c.primary} />
              <Text style={styles.servicesRetryText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : null}
        {bookingError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: c.destructive, margin: 20 }}
          >
            {bookingError}
          </Text>
        ) : null}
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
                  setSelectedPeriod(undefined);
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
          <View style={styles.slotSection}>
            <View style={styles.periodTabs}>
              {periodOptions.map((period) => {
                const selected = activePeriod?.id === period.id;
                return (
                  <Pressable
                    key={period.id}
                    onPress={() => {
                      setSelectedPeriod(period.id);
                      setSelectedSlotId(null);
                    }}
                    style={[
                      styles.periodTab,
                      selected && styles.periodTabSelected,
                    ]}
                  >
                    <Feather
                      name={period.icon}
                      size={14}
                      color={selected ? "#fff" : c.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.periodTabText,
                        selected && styles.periodTabTextSelected,
                      ]}
                    >
                      {period.label}
                    </Text>
                    <Text
                      style={[
                        styles.periodCountText,
                        selected && styles.periodTabTextSelected,
                      ]}
                    >
                      {period.availableCount}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <FlatList
              data={visibleSlots}
              keyExtractor={(s) => String(s.id)}
              scrollEnabled={false}
              numColumns={3}
              columnWrapperStyle={styles.slotRow}
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
          </View>
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

            {service && (
              <Text style={{ color: c.foreground }}>
                {service.name} · {(service.priceKurus / 100).toFixed(2)} ₺ ·{" "}
                {service.durationMinutes} dk
              </Text>
            )}
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
                  createAppt.mutate({
                    data: { slotId: selectedSlotId, serviceId },
                  });
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
  servicesHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
  },
  stepBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  servicesHeadingText: { flex: 1 },
  servicesTitle: { fontSize: 16, fontWeight: "700", color: c.foreground },
  servicesSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: c.mutedForeground,
  },
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: c.accent + "18",
  },
  requiredBadgeText: { fontSize: 10, fontWeight: "700", color: c.accent },
  serviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 9,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  serviceCardSelected: {
    borderColor: c.primary,
    backgroundColor: c.primary + "08",
  },
  serviceCardPressed: { opacity: 0.78 },
  serviceRadio: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
  },
  serviceRadioSelected: {
    borderColor: c.primary,
    backgroundColor: c.primary,
  },
  serviceInfo: { flex: 1, minWidth: 0 },
  serviceNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  serviceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: c.foreground,
  },
  serviceNameSelected: { color: c.primary },
  servicePrice: { fontSize: 16, fontWeight: "700", color: c.foreground },
  serviceDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: c.mutedForeground,
  },
  serviceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 10,
  },
  serviceMetaText: {
    fontSize: 11,
    fontWeight: "600",
    color: c.mutedForeground,
  },
  serviceMetaDot: {
    width: 3,
    height: 3,
    marginHorizontal: 2,
    borderRadius: 2,
    backgroundColor: c.border,
  },
  serviceSelectedText: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: "700",
    color: c.primary,
  },
  emptyServices: {
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    gap: 5,
  },
  emptyServicesTitle: {
    marginTop: 3,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  emptyServicesText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    textAlign: "center",
  },
  servicesRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.secondary,
  },
  servicesRetryText: {
    fontSize: 12,
    fontWeight: "700",
    color: c.primary,
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
  slotSection: { paddingBottom: 100 },
  periodTabs: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  periodTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  periodTabSelected: { borderColor: c.primary, backgroundColor: c.primary },
  periodTabText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
  },
  periodTabTextSelected: { color: "#fff" },
  periodCountText: {
    minWidth: 16,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  slotGrid: { paddingHorizontal: 16, gap: 8 },
  slotRow: { gap: 8 },
  slot: {
    flex: 1,
    maxWidth: "32%",
    minHeight: 100,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingVertical: 11,
    paddingHorizontal: 8,
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
  slotTimeCol: { alignItems: "center" },
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
    alignSelf: "stretch",
    backgroundColor: "#D1FAE5",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  badgeOpenText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  badgeSelected: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.primary,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  badgeSelectedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  badgeBooked: {
    alignSelf: "stretch",
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  badgeBookedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
  },
  badgePast: {
    alignSelf: "stretch",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: "center",
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
