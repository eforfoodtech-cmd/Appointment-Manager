/**
 * Appointment detail — shows full info with status management.
 * After any status mutation: invalidates relevant queries and navigates back.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetAppointment,
  useUpdateAppointment,
  getGetAppointmentQueryKey,
  getListAppointmentsQueryKey,
  getGetBarberDashboardQueryKey,
  getGetUpcomingAppointmentsQueryKey,
  getGetBarberSlotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";
import { Alert } from "@/utils/alert";
import { RescheduleAppointment } from "@/components/RescheduleAppointment";

const c = colors.light;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Bekliyor", color: "#F59E0B" },
  confirmed: { label: "Onaylandı", color: "#10B981" },
  cancelled: { label: "İptal", color: "#EF4444" },
  completed: { label: "Tamamlandı", color: "#6366F1" },
  no_show: { label: "Gelmedi", color: "#EF4444" },
};

/** Navigate back reliably on both web and native. */
function goBack() {
  router.back();
}

export default function AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const apptId = Number(id);

  const { data: appt, isLoading } = useGetAppointment(apptId);

  /** Invalidate every query that shows appointment data. */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetAppointmentQueryKey(apptId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetUpcomingAppointmentsQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getGetBarberDashboardQueryKey({ date: appt!.date }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetBarberSlotsQueryKey(appt!.barberId, { date: appt!.date }),
    });
    queryClient.removeQueries({ queryKey: getGetAppointmentQueryKey(apptId) });
  };

  const update = useUpdateAppointment({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        goBack();
      },
      onError: (err: any) => {
        Alert.alert("Hata", err?.data?.error || "İşlem başarısız oldu");
      },
    },
  });

  const isMutating = update.isPending;

  const handleStatusChange = (status: "cancelled" | "no_show") => {
    const labels: Record<string, { title: string; msg: string; btn: string }> =
      {
        cancelled: {
          title: "Randevuyu İptal Et",
          msg: "Bu randevuyu iptal etmek istediğine emin misin?",
          btn: "İptal Et",
        },
        no_show: {
          title: "Gelmedi İşareti",
          msg: "Müşteri gelmedi olarak işaretlensin mi? (1 ay süreli engel oluşur)",
          btn: "İşaretle",
        },
      };

    const { title, msg, btn } = labels[status]!;

    Alert.alert(title, msg, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: btn,
        style: "destructive",
        onPress: () =>
          update.mutate({ appointmentId: apptId, data: { status } }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!appt) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: c.mutedForeground }}>Randevu bulunamadı</Text>
      </View>
    );
  }

  const statusInfo = STATUS_LABELS[appt.status] || {
    label: appt.status,
    color: c.mutedForeground,
  };
  const isBarber = user?.role === "barber";
  const isActive = appt.status === "confirmed" || appt.status === "pending";
  const slotStartMs = new Date(
    `${appt.date}T${appt.startTime}:00+03:00`,
  ).getTime();
  const minutesToStart = (slotStartMs - Date.now()) / 60000;
  const slotStarted = minutesToStart <= 0;
  const customerCanCancel = minutesToStart > 5 * 60;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Mutation loading overlay */}
      {isMutating && (
        <View style={styles.mutatingBanner}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={styles.mutatingText}>İşleniyor…</Text>
        </View>
      )}

      {/* Status badge */}
      <View
        style={[
          styles.statusBanner,
          { backgroundColor: statusInfo.color + "20" },
        ]}
      >
        <View
          style={[styles.statusDot, { backgroundColor: statusInfo.color }]}
        />
        <Text style={[styles.statusText, { color: statusInfo.color }]}>
          {statusInfo.label}
        </Text>
      </View>

      {/* Date/time */}
      <View style={styles.timeCard}>
        <Feather name="calendar" size={24} color={c.primary} />
        <View>
          <Text style={styles.timeDate}>
            {new Date(appt.date + "T12:00:00").toLocaleDateString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
          <Text style={styles.timeRange}>
            {appt.startTime} — {appt.endTime}
          </Text>
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoCard}>
        {appt.serviceName && (
          <InfoRow
            icon="scissors"
            label="Hizmet"
            value={`${appt.serviceName} · ${((appt.priceKurus ?? 0) / 100).toFixed(2)} ₺ · ${appt.durationMinutes ?? 0} dk`}
          />
        )}
        <InfoRow
          icon="scissors"
          label="Berber"
          value={`${appt.barberName} — ${appt.shopName}`}
        />
        <InfoRow icon="user" label="Müşteri" value={appt.customerName} />
        {appt.customerPhone && (
          <InfoRow icon="phone" label="Telefon" value={appt.customerPhone} />
        )}
        {appt.notes && (
          <InfoRow icon="file-text" label="Not" value={appt.notes} />
        )}
        <InfoRow
          icon="clock"
          label="Oluşturulma"
          value={new Date(appt.createdAt).toLocaleDateString("tr-TR")}
        />
      </View>

      {/* Actions */}
      {isActive && !slotStarted && (isBarber || customerCanCancel) && (
        <RescheduleAppointment
          id={appt.id}
          barberId={appt.barberId}
          initialDate={appt.date}
        />
      )}
      {isActive && !isMutating && (
        <View style={styles.actions}>
          {isBarber ? (
            <>
              {slotStarted && (
                <ActionBtn
                  icon="user-x"
                  label="Gelmedi"
                  color={c.warning}
                  onPress={() => handleStatusChange("no_show")}
                />
              )}
              <ActionBtn
                icon="x-circle"
                label="İptal Et"
                color={c.destructive}
                onPress={() => handleStatusChange("cancelled")}
              />
            </>
          ) : customerCanCancel ? (
            <ActionBtn
              icon="x-circle"
              label="İptal Et"
              color={c.destructive}
              onPress={() => handleStatusChange("cancelled")}
            />
          ) : (
            <Text style={styles.cancelHint}>
              Randevuya 5 saatten az kaldığı için iptal edilemez.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={16} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  onPress,
}: {
  icon: any;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: color + "15", borderColor: color + "40" },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
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
  mutatingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: colors.radius,
    backgroundColor: c.primary + "15",
  },
  mutatingText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.primary,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  timeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  timeDate: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  timeRange: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: c.primary,
    marginTop: 2,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
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
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 20,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: colors.radius,
    borderWidth: 1,
    gap: 6,
    backgroundColor: c.card,
  },
  actionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cancelHint: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    textAlign: "center",
    paddingVertical: 12,
  },
});
