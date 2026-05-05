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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetAppointment,
  useUpdateAppointment,
  useCreateBlock,
  getListAppointmentsQueryKey,
  getGetBarberDashboardQueryKey,
  getGetUpcomingAppointmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const c = colors.light;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Bekliyor",    color: "#F59E0B" },
  confirmed: { label: "Onaylandı",   color: "#10B981" },
  cancelled: { label: "İptal",       color: "#EF4444" },
  completed: { label: "Tamamlandı",  color: "#6366F1" },
  no_show:   { label: "Gelmedi",     color: "#EF4444" },
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
    // Prefix-based: catches all param variants
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBarberDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    // Remove the single-appointment cache entry so stale data doesn't flash
    queryClient.removeQueries({ queryKey: [`/api/appointments/${apptId}`] });
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

  const createBlock = useCreateBlock({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/barbers/me/blocks"] });
        // After blocking, also go back so the screen doesn't freeze
        goBack();
      },
      onError: (err: any) => Alert.alert("Hata", err?.data?.error || "Engellenemedi"),
    },
  });

  const isMutating = update.isPending || createBlock.isPending;

  const handleStatusChange = (status: "cancelled" | "no_show" | "completed") => {
    const labels: Record<string, { title: string; msg: string; btn: string }> = {
      cancelled: {
        title: "Randevuyu İptal Et",
        msg: "Bu randevuyu iptal etmek istiyor musunuz?",
        btn: "İptal Et",
      },
      no_show: {
        title: "Gelmedi İşareti",
        msg: "Müşteri gelmedi olarak işaretlensin mi?",
        btn: "İşaretle",
      },
      completed: {
        title: "Tamamlandı",
        msg: "Randevuyu tamamlandı olarak işaretleyelim mi?",
        btn: "Tamamlandı",
      },
    };

    const { title, msg, btn } = labels[status];

    Alert.alert(title, msg, [
      { text: "Geri", style: "cancel" },
      {
        text: btn,
        style: status === "completed" ? "default" : "destructive",
        onPress: () =>
          update.mutate({ appointmentId: apptId, data: { status } }),
      },
    ]);
  };

  const handleBlock = () => {
    Alert.alert(
      "Müşteriyi Engelle",
      "Bu müşteri artık randevu alamayacak. Süreyi seçin:",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "1 Ay",
          onPress: () => {
            const exp = new Date();
            exp.setMonth(exp.getMonth() + 1);
            createBlock.mutate({
              data: {
                customerId: appt!.customerId,
                reason: "No-show",
                expiresAt: exp.toISOString(),
              },
            });
          },
        },
        {
          text: "Kalıcı",
          style: "destructive",
          onPress: () =>
            createBlock.mutate({
              data: { customerId: appt!.customerId, reason: "No-show kalıcı engel" },
            }),
        },
      ],
    );
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

  const statusInfo = STATUS_LABELS[appt.status] || { label: appt.status, color: c.mutedForeground };
  const isBarber = user?.role === "barber";
  const isActive = appt.status === "confirmed" || appt.status === "pending";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Header with back button */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={c.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Randevu Detayı</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Mutation loading overlay */}
      {isMutating && (
        <View style={styles.mutatingBanner}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={styles.mutatingText}>İşleniyor…</Text>
        </View>
      )}

      {/* Status badge */}
      <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + "20" }]}>
        <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
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
        <InfoRow icon="scissors" label="Berber"   value={`${appt.barberName} — ${appt.shopName}`} />
        <InfoRow icon="user"     label="Müşteri"  value={appt.customerName} />
        {appt.customerPhone && (
          <InfoRow icon="phone" label="Telefon" value={appt.customerPhone} />
        )}
        {appt.notes && <InfoRow icon="file-text" label="Not" value={appt.notes} />}
        <InfoRow
          icon="clock"
          label="Oluşturulma"
          value={new Date(appt.createdAt).toLocaleDateString("tr-TR")}
        />
      </View>

      {/* Actions */}
      {isActive && !isMutating && (
        <View style={styles.actions}>
          {isBarber ? (
            <>
              <ActionBtn
                icon="check-circle"
                label="Tamamlandı"
                color={c.success}
                onPress={() => handleStatusChange("completed")}
              />
              <ActionBtn
                icon="user-x"
                label="Gelmedi"
                color={c.warning}
                onPress={() => handleStatusChange("no_show")}
              />
              <ActionBtn
                icon="x-circle"
                label="İptal Et"
                color={c.destructive}
                onPress={() => handleStatusChange("cancelled")}
              />
            </>
          ) : (
            <ActionBtn
              icon="x-circle"
              label="İptal Et"
              color={c.destructive}
              onPress={() => handleStatusChange("cancelled")}
            />
          )}
        </View>
      )}

      {/* Barber: block option after no-show */}
      {isBarber && appt.status === "no_show" && !isMutating && (
        <TouchableOpacity style={styles.blockBtn} onPress={handleBlock} activeOpacity={0.8}>
          <Feather name="shield" size={18} color={c.destructive} />
          <Text style={styles.blockText}>Müşteriyi Engelle</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
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
      style={[styles.actionBtn, { backgroundColor: color + "15", borderColor: color + "40" }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: c.background },
  loading:  { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.background },
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
  mutatingText: { fontSize: 14, fontFamily: "Inter_500Medium", color: c.primary },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: colors.radius,
  },
  statusDot:  { width: 10, height: 10, borderRadius: 5 },
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
  },
  timeDate:  { fontSize: 16, fontFamily: "Inter_600SemiBold", color: c.foreground },
  timeRange: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.primary, marginTop: 2 },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  infoLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  infoValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, marginTop: 2 },
  actions: { flexDirection: "row", marginHorizontal: 16, marginTop: 20, gap: 10 },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: colors.radius,
    borderWidth: 1,
    gap: 6,
  },
  actionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  blockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: colors.radius,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  blockText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.destructive },
});
