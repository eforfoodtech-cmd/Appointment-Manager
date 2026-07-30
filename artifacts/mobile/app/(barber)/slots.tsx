/**
 * Barber Slots — manage appointment slots by date.
 * Booked slots show customer detail modal on tap.
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
  Linking,
  KeyboardAvoidingView,
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
  useGetMyAvailability,
  useSetMyAvailability,
  getGetMyAvailabilityQueryKey,
  useCreateAppointment,
  useUpdateAppointment,
} from "@workspace/api-client-react";
import type { SlotAppointmentDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PressableScale } from "@/components/PressableScale";
import { useToast } from "@/components/Toast";
import colors from "@/constants/colors";
import { toTurkishMobileTelUrl } from "@/utils/phone";
import { formatTimeInput, normalizeTimeInput } from "@/utils/timeInput";

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

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  completed: "Tamamlandı",
  cancelled: "İptal",
  no_show: "Gelmedi",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#10B981",
  completed: "#6366F1",
  cancelled: "#EF4444",
  no_show: "#9CA3AF",
};

interface CustomerDetailModalProps {
  visible: boolean;
  slotTime: string;
  appointment: SlotAppointmentDetail | null;
  isPast: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onClose: () => void;
}

function CustomerDetailModal({
  visible,
  slotTime,
  appointment,
  isPast,
  cancelling,
  onCancel,
  onClose,
}: CustomerDetailModalProps) {
  if (!appointment) return null;
  const statusColor = STATUS_COLORS[appointment.status] ?? c.mutedForeground;
  const statusLabel = STATUS_LABELS[appointment.status] ?? appointment.status;
  const isActive =
    appointment.status === "pending" || appointment.status === "confirmed";
  const canCancelManual = appointment.isManual && isActive && !isPast;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.detailModal}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Handle bar */}
          <View style={styles.handleBar} />

          <Text style={styles.detailTitle}>Randevu Detayı</Text>
          <Text style={styles.detailSlotTime}>{slotTime}</Text>

          {/* Status badge */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + "20" },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>

          {/* Customer info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Feather name="user" size={16} color={c.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Müşteri</Text>
                <Text style={styles.infoValue}>{appointment.customerName}</Text>
              </View>
            </View>

            {appointment.customerPhone ? (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() =>
                  Linking.openURL(
                    toTurkishMobileTelUrl(appointment.customerPhone!),
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.infoIconWrap}>
                  <Feather name="phone" size={16} color={c.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Telefon</Text>
                  <Text style={[styles.infoValue, styles.infoLink]}>
                    {appointment.customerPhone}
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={16}
                  color={c.mutedForeground}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <Feather name="phone" size={16} color={c.mutedForeground} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Telefon</Text>
                  <Text
                    style={[styles.infoValue, { color: c.mutedForeground }]}
                  >
                    Belirtilmemiş
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <View style={styles.infoIconWrap}>
                <Feather name="file-text" size={16} color={c.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Notlar</Text>
                <Text style={styles.infoValue}>
                  {appointment.notes?.trim() ? appointment.notes : "Not yok"}
                </Text>
              </View>
            </View>
          </View>

          {appointment.isManual && (
            <View style={styles.manualInfoRow}>
              <Feather name="edit-3" size={14} color="#7C3AED" />
              <Text style={styles.manualInfoText}>Manuel randevu</Text>
            </View>
          )}

          {canCancelManual ? (
            <View style={styles.detailActions}>
              <TouchableOpacity
                style={[styles.closeBtn, { flex: 1 }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.closeBtnText}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.detailCancelBtn,
                  { flex: 1 },
                  cancelling && { opacity: 0.7 },
                ]}
                onPress={onCancel}
                activeOpacity={0.8}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.detailCancelText}>
                    Randevuyu İptal Et
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const days = getNext7Days();
  const [selectedDate, setSelectedDate] = useState(days[0]!);
  const [showAddModal, setShowAddModal] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  const [detailSlot, setDetailSlot] = useState<{
    time: string;
    appointment: SlotAppointmentDetail;
    isPast: boolean;
  } | null>(null);

  const [manualSlot, setManualSlot] = useState<{
    slotId: number;
    time: string;
  } | null>(null);
  const [manualName, setManualName] = useState("");

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

  const invalidateSlots = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).includes("/slots"),
    });

  const slotsQueryKey = barberId
    ? getGetBarberSlotsQueryKey(barberId, { date: selectedDate })
    : null;

  const createSlot = useCreateSlot({
    mutation: {
      onSuccess: () => {
        invalidateSlots();
        setShowAddModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (err: any) =>
        Alert.alert("Hata", err?.data?.error ?? "Saat aralığı eklenemedi"),
    },
  });

  const updateSlot = useUpdateSlot({
    mutation: {
      onMutate: async ({ slotId, data }) => {
        if (!slotsQueryKey) return;
        await queryClient.cancelQueries({ queryKey: slotsQueryKey });
        const prev = queryClient.getQueryData(slotsQueryKey);
        queryClient.setQueryData(slotsQueryKey, (old: any) =>
          Array.isArray(old)
            ? old.map((s: any) => (s.id === slotId ? { ...s, ...data } : s))
            : old,
        );
        return { prev };
      },
      onError: (err: any, _vars, ctx: any) => {
        if (slotsQueryKey && ctx?.prev !== undefined)
          queryClient.setQueryData(slotsQueryKey, ctx.prev);
        Alert.alert("Hata", err?.data?.error ?? "Saat aralığı güncellenemedi");
      },
      onSettled: () => invalidateSlots(),
    },
  });

  const deleteSlot = useDeleteSlot({
    mutation: {
      onMutate: async ({ slotId }) => {
        if (!slotsQueryKey) return;
        await queryClient.cancelQueries({ queryKey: slotsQueryKey });
        const prev = queryClient.getQueryData(slotsQueryKey);
        queryClient.setQueryData(slotsQueryKey, (old: any) =>
          Array.isArray(old) ? old.filter((s: any) => s.id !== slotId) : old,
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return { prev };
      },
      onError: (err: any, _vars, ctx: any) => {
        if (slotsQueryKey && ctx?.prev !== undefined)
          queryClient.setQueryData(slotsQueryKey, ctx.prev);
        Alert.alert("Hata", err?.data?.error ?? "Saat aralığı silinemedi");
      },
      onSettled: () => invalidateSlots(),
    },
  });

  // ── Weekly template helpers ────────────────────────────────────────────────
  const { showToast, ToastComponent } = useToast();

  const createManualAppt = useCreateAppointment({
    mutation: {
      onSuccess: () => {
        invalidateSlots();
        setManualSlot(null);
        setManualName("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast("Manuel randevu eklendi", "success");
      },
      onError: (err: any) =>
        Alert.alert("Hata", err?.data?.error ?? "Randevu oluşturulamadı"),
    },
  });

  const cancelManualAppt = useUpdateAppointment({
    mutation: {
      onSuccess: () => {
        invalidateSlots();
        setDetailSlot(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast("Manuel randevu iptal edildi", "success");
      },
      onError: (err: any) =>
        Alert.alert("Hata", err?.data?.error ?? "Randevu iptal edilemedi"),
    },
  });
  const setAvailability = useSetMyAvailability({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetMyAvailabilityQueryKey(),
        });
        queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0] as string).includes("/slots"),
        });
        showToast("Haftalık program güncellendi", "success");
      },
      onError: (err: any) =>
        showToast(err?.data?.error ?? "Program güncellenemedi", "error"),
    },
  });

  const handleToggleTemplateDay = () => {
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).includes("/slots"),
    });
  };

  const handleCreateSlot = () => {
    const isValidTime = (t: string, allowMidnight: boolean) => {
      if (!/^\d{2}:\d{2}$/.test(t)) return false;
      const [hStr, mStr] = t.split(":");
      const h = parseInt(hStr!, 10);
      const m = parseInt(mStr!, 10);
      if (allowMidnight && h === 24 && m === 0) return true;
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    };
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h! * 60 + m!;
    };
    if (!isValidTime(startTime, false)) {
      showToast("Başlangıç saati geçersiz (ÖR: 09:00)", "error");
      return;
    }
    if (!isValidTime(endTime, true)) {
      showToast("Bitiş saati geçersiz (ÖR: 10:00 veya 24:00)", "error");
      return;
    }
    if (toMin(startTime) >= toMin(endTime)) {
      showToast("Başlangıç saati bitiş saatinden önce olmalı", "error");
      return;
    }
    createSlot.mutate({
      data: { date: selectedDate, startTime, endTime, isAvailable: true },
    });
  };

  const handleToggle = (slotId: number, isAvailable: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSlot.mutate({ slotId, data: { isAvailable: !isAvailable } });
  };

  const handleDelete = (slotId: number) => {
    Alert.alert(
      "Sil",
      "Bu saat aralığını silmek istediğinizden emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => deleteSlot.mutate({ slotId }),
        },
      ],
    );
  };

  const handleSlotPress = (slot: {
    id: number;
    startTime: string;
    endTime: string;
    isBooked: boolean;
    isAvailable: boolean;
    appointment?: SlotAppointmentDetail | null;
  }) => {
    if (slot.isBooked && slot.appointment) {
      setDetailSlot({
        time: `${slot.startTime} – ${slot.endTime}`,
        appointment: slot.appointment,
        isPast: isPastSlot(slot.startTime),
      });
      return;
    }
    if (!slot.isBooked && slot.isAvailable && !isPastSlot(slot.startTime)) {
      setManualName("");
      setManualSlot({
        slotId: slot.id,
        time: `${slot.startTime} – ${slot.endTime}`,
      });
    }
  };

  const { date: todayStr, minutes: nowMinutes } = getNowIstanbul();
  const isPastSlot = (startTime: string) => {
    if (selectedDate > todayStr) return false;
    if (selectedDate < todayStr) return true;
    const [h, m] = startTime.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0) <= nowMinutes;
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);
  const selectedDateDisplay = new Date(
    selectedDate + "T12:00:00",
  ).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View style={[styles.container, { paddingTop }]}>
      {/* Title */}
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Saat Aralıkları</Text>
          <Text style={styles.titleMeta}>{selectedDateDisplay}</Text>
        </View>
        <PressableScale
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
          scaleTo={0.96}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Ekle</Text>
        </PressableScale>
      </View>

      {/* Day selector — fixed-height wrapper so slot list always starts at same Y */}
      <View style={styles.daysScrollWrapper}>
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
                onPress={() => setSelectedDate(d)}
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
      </View>

      {/* Slots list — flex:1 so both loading and data states fill same space */}
      {isLoading ? (
        <View style={[styles.empty, { flex: 1 }]}>
          <ActivityIndicator color={c.primary} />
          <Text style={styles.emptyText}>Yükleniyor…</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={slots ?? []}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={[
            styles.slotList,
            { paddingBottom: insets.bottom + 90 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clock" size={40} color={c.border} />
              <Text style={styles.emptyText}>Bu gün için saat aralığı yok</Text>
            </View>
          }
          renderItem={({ item: slot }) => {
            const isPast = isPastSlot(slot.startTime);
            return (
              <PressableScale
                onPress={() => handleSlotPress(slot)}
                disabled={!slot.isBooked && (!slot.isAvailable || isPast)}
                scaleTo={0.985}
              >
                <View
                  style={[
                    styles.slotRow,
                    slot.isBooked &&
                      !isPast &&
                      (slot.appointment?.isManual
                        ? styles.slotRowManual
                        : styles.slotRowBooked),
                    slot.isBooked && isPast && styles.slotRowPastBooked,
                    !slot.isBooked && !slot.isAvailable && styles.slotRowClosed,
                    !slot.isBooked && isPast && styles.slotRowPast,
                  ]}
                >
                  <View
                    style={[
                      styles.slotRail,
                      !slot.isBooked &&
                        slot.isAvailable &&
                        !isPast &&
                        styles.slotRailOpen,
                      slot.isBooked &&
                        !isPast &&
                        (slot.appointment?.isManual
                          ? styles.slotRailManual
                          : styles.slotRailBooked),
                      ((!slot.isBooked && !slot.isAvailable) || isPast) &&
                        styles.slotRailMuted,
                    ]}
                  />
                  {/* Time */}
                  <View style={styles.slotTimeCol}>
                    <Text
                      style={[
                        styles.slotTime,
                        slot.isBooked && !isPast && styles.slotTimeBooked,
                        isPast && styles.slotTimePast,
                      ]}
                    >
                      {slot.startTime}
                    </Text>
                    <Text
                      style={[
                        styles.slotEndTime,
                        slot.isBooked && !isPast && styles.slotTimeBooked,
                        isPast && styles.slotTimePast,
                      ]}
                    >
                      {slot.endTime}
                    </Text>
                  </View>

                  {/* Status / customer */}
                  {slot.isBooked ? (
                    <View style={styles.bookedInfo}>
                      <View
                        style={
                          isPast
                            ? styles.badgePast
                            : slot.appointment?.isManual
                              ? styles.badgeManual
                              : styles.badgeBooked
                        }
                      >
                        <Text
                          style={
                            isPast
                              ? styles.badgePastText
                              : slot.appointment?.isManual
                                ? styles.badgeManualText
                                : styles.badgeBookedText
                          }
                        >
                          {isPast
                            ? "Başladı"
                            : slot.appointment?.isManual
                              ? "Manuel"
                              : "Dolu"}
                        </Text>
                      </View>
                      {slot.appointment && (
                        <Text
                          style={[
                            styles.customerName,
                            isPast && { color: c.mutedForeground },
                          ]}
                          numberOfLines={1}
                        >
                          {slot.appointment.customerName}
                        </Text>
                      )}
                    </View>
                  ) : isPast ? (
                    <View style={styles.badgePast}>
                      <Text style={styles.badgePastText}>Geçti</Text>
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

                  {/* Booked slot tap hint */}
                  {slot.isBooked && (
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={isPast ? c.mutedForeground : c.primary}
                    />
                  )}

                  {/* Actions for non-booked slots */}
                  {!slot.isBooked && (
                    <View style={styles.slotActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleToggle(slot.id, slot.isAvailable)}
                        activeOpacity={0.7}
                        disabled={updateSlot.isPending || isPast}
                      >
                        <Feather
                          name={slot.isAvailable ? "eye" : "eye-off"}
                          size={18}
                          color={
                            isPast
                              ? c.border
                              : slot.isAvailable
                                ? c.primary
                                : c.mutedForeground
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleDelete(slot.id)}
                        activeOpacity={0.7}
                        disabled={deleteSlot.isPending || isPast}
                      >
                        <Feather
                          name="trash-2"
                          size={18}
                          color={isPast ? c.border : c.destructive}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </PressableScale>
            );
          }}
        />
      )}

      {/* Add slot modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.addModalScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.addModalContent}>
              <View style={styles.handleBar} />
              <View style={styles.modalHero}>
                <View style={styles.modalIcon}>
                  <Feather name="clock" size={20} color={c.accent} />
                </View>
                <View style={styles.modalTitleBlock}>
                  <Text style={styles.modalKicker}>Saat aralığı</Text>
                  <Text style={styles.modalTitle}>Yeni Slot Ekle</Text>
                </View>
              </View>
              <View style={styles.modalDatePill}>
                <Feather name="calendar" size={14} color={c.primary} />
                <Text style={styles.modalDate}>{selectedDateDisplay}</Text>
              </View>

              <View style={styles.timeRow}>
                <View style={styles.timeFieldCard}>
                  <Text style={styles.modalLabel}>Başlangıç</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={startTime}
                    onChangeText={(v) => setStartTime(formatTimeInput(v))}
                    onBlur={() => setStartTime(normalizeTimeInput(startTime))}
                    placeholder="09:00"
                    placeholderTextColor={c.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <View style={styles.timeFieldCard}>
                  <Text style={styles.modalLabel}>Bitiş</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={endTime}
                    onChangeText={(v) => setEndTime(formatTimeInput(v))}
                    onBlur={() => setEndTime(normalizeTimeInput(endTime))}
                    placeholder="10:00"
                    placeholderTextColor={c.mutedForeground}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
              </View>

              <View style={styles.modalActions}>
                <PressableScale
                  style={styles.modalCancel}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={styles.modalCancelText}>İptal</Text>
                </PressableScale>
                <PressableScale
                  style={[
                    styles.modalConfirm,
                    createSlot.isPending && { opacity: 0.7 },
                  ]}
                  onPress={handleCreateSlot}
                  disabled={createSlot.isPending}
                >
                  {createSlot.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Ekle</Text>
                  )}
                </PressableScale>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Customer detail modal */}
      <CustomerDetailModal
        visible={detailSlot !== null}
        slotTime={detailSlot?.time ?? ""}
        appointment={detailSlot?.appointment ?? null}
        isPast={detailSlot?.isPast ?? false}
        cancelling={cancelManualAppt.isPending}
        onCancel={() => {
          const appt = detailSlot?.appointment;
          if (!appt) return;
          Alert.alert(
            "Manuel Randevuyu İptal Et",
            "Bu manuel randevuyu iptal etmek istediğine emin misin?",
            [
              { text: "Vazgeç", style: "cancel" },
              {
                text: "İptal Et",
                style: "destructive",
                onPress: () =>
                  cancelManualAppt.mutate({
                    appointmentId: appt.id,
                    data: { status: "cancelled" },
                  }),
              },
            ],
          );
        }}
        onClose={() => setDetailSlot(null)}
      />

      {/* Manual booking modal */}
      <Modal
        visible={manualSlot !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setManualSlot(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setManualSlot(null)}
          />
          <View style={styles.manualModal}>
            <View style={styles.handleBar} />
            <View style={styles.modalHero}>
              <View style={[styles.modalIcon, styles.manualModalIcon]}>
                <Feather name="user-plus" size={20} color="#7C3AED" />
              </View>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalKicker}>Randevu ekle</Text>
                <Text style={styles.manualTitle}>Manuel Randevu</Text>
              </View>
            </View>
            <View style={styles.modalDatePill}>
              <Feather name="clock" size={14} color={c.primary} />
              <Text style={styles.manualSubtitle}>
                {manualSlot?.time ?? ""}
              </Text>
            </View>
            <Text style={styles.manualLabel}>Müşteri Adı</Text>
            <TextInput
              style={styles.manualInput}
              value={manualName}
              onChangeText={setManualName}
              placeholder="Ad Soyad"
              placeholderTextColor={c.mutedForeground}
              autoFocus
              returnKeyType="done"
            />
            <View style={styles.manualActions}>
              <PressableScale
                style={styles.modalCancel}
                onPress={() => setManualSlot(null)}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </PressableScale>
              <PressableScale
                style={styles.manualConfirm}
                onPress={() => {
                  const name = manualName.trim();
                  if (!name) {
                    Alert.alert("Hata", "Müşteri adı zorunlu");
                    return;
                  }
                  if (!manualSlot) return;
                  createManualAppt.mutate({
                    data: {
                      slotId: manualSlot.slotId,
                      manualCustomerName: name,
                    },
                  });
                }}
                disabled={createManualAppt.isPending}
              >
                {createManualAppt.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Ekle</Text>
                )}
              </PressableScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {ToastComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: c.foreground },
  titleMeta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
    marginTop: 3,
    textTransform: "capitalize",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.primary,
    borderRadius: 20,
    height: 40,
    paddingHorizontal: 14,
    justifyContent: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  daysScrollWrapper: { height: 108, flexShrink: 0, overflow: "hidden" },
  daysRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  dayBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 92,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: colors.radius,
    backgroundColor: c.card,
    minWidth: 72,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  dayBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  dayName: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  dayNameActive: { color: "rgba(255,255,255,0.78)" },
  dayDate: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
    marginTop: 3,
  },
  dayDateActive: { color: "#fff" },
  dayMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
    marginTop: 2,
    textTransform: "uppercase",
  },
  dayMonthActive: { color: "rgba(255,255,255,0.78)" },
  slotList: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },

  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.border,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  slotRowBooked: {
    backgroundColor: c.primary + "10",
    borderColor: c.primary + "30",
  },
  slotRowManual: { backgroundColor: "#F5F3FF", borderColor: "#7C3AED" + "30" },
  slotRowClosed: { backgroundColor: c.secondary, opacity: 0.82 },
  slotRowPast: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    opacity: 0.75,
  },
  slotRowPastBooked: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },

  slotRail: {
    width: 4,
    height: 44,
    borderRadius: 999,
    backgroundColor: c.border,
    flexShrink: 0,
  },
  slotRailOpen: { backgroundColor: "#10B981" },
  slotRailBooked: { backgroundColor: c.primary },
  slotRailManual: { backgroundColor: "#7C3AED" },
  slotRailMuted: { backgroundColor: "#CBD5E1" },

  slotTimeCol: { width: 62, flexShrink: 0 },
  slotTime: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground },
  slotEndTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 1,
  },
  slotTimeBooked: { color: c.primary },
  slotTimeClosed: { color: c.mutedForeground },
  slotTimePast: { color: "#9CA3AF" },

  bookedInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  customerName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.primary,
  },

  badgeOpen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
    marginRight: 8,
  },
  badgeOpenText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  badgeBooked: {
    backgroundColor: c.primary + "20",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
    marginRight: 8,
  },
  badgeBookedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.primary,
  },
  badgeManual: {
    backgroundColor: "#EDE9FE",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
    marginRight: 8,
  },
  badgeManualText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#7C3AED",
  },
  badgePast: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center" as const,
    marginRight: 8,
  },
  badgePastText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#9CA3AF",
  },
  badgeClosed: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
    marginRight: 8,
  },
  badgeClosedText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
  },

  slotActions: { flexDirection: "row", gap: 4, flexShrink: 0 },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },

  templateBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#D1FAE5",
    gap: 6,
  },
  templateBannerClosed: { backgroundColor: c.secondary },
  templateBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#059669",
  },
  templateBannerTextClosed: { color: c.mutedForeground },

  empty: { alignItems: "center", paddingVertical: 40, gap: 16 },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  addModalScroll: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  addModalContent: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: c.border,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  modalHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primary + "12",
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "center",
    alignItems: "center",
  },
  manualModalIcon: { backgroundColor: "#7C3AED14" },
  modalTitleBlock: { flex: 1, minWidth: 0 },
  modalKicker: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  modalDatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalDate: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: c.primary,
    textTransform: "capitalize",
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  timeRow: { flexDirection: "row", gap: 12 },
  timeFieldCard: {
    flex: 1,
    gap: 7,
    borderRadius: colors.radius,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
  },
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
    borderWidth: 1,
    borderColor: c.border,
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  modalConfirm: {
    flex: 1,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  modalConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },

  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  manualModal: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: c.border,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  manualTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  manualSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  manualLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
    marginTop: 8,
  },
  manualInput: {
    backgroundColor: c.background,
    borderRadius: colors.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
  },
  manualActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  manualConfirm: {
    flex: 1,
    backgroundColor: "#7C3AED",
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
  },

  // Customer detail modal
  detailModal: {
    backgroundColor: c.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: "center",
    marginBottom: 4,
  },
  detailTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
    textAlign: "center",
  },
  detailSlotTime: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
    textAlign: "center",
    marginTop: -8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  infoCard: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  infoLink: { color: c.primary },
  closeBtn: {
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  manualInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#7C3AED15",
    borderRadius: colors.radius,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  manualInfoText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#7C3AED",
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  detailCancelBtn: {
    backgroundColor: "#EF4444",
    borderRadius: colors.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  detailCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
