/**
 * Barber Dashboard — today's summary and appointment list.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetBarberDashboard,
  useUpdateAppointment,
  getGetBarberDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import { AppointmentCard } from "@/components/AppointmentCard";

const c = colors.light;

function todayString() {
  return new Date().toISOString().split("T")[0]!;
}

export default function BarberDashboard() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayString);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useGetBarberDashboard(
    { date },
    { query: { queryKey: getGetBarberDashboardQueryKey({ date }) } },
  );

  const updateAppt = useUpdateAppointment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetBarberDashboardQueryKey({ date }),
        }),
    },
  });

  const handleStatusChange = (
    id: number,
    status: "cancelled" | "no_show",
  ) => {
    updateAppt.mutate({ appointmentId: id, data: { status } });
  };

  const paddingTop =
    insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Merhaba ✂</Text>
          <Text style={styles.dateLabel}>{formatDateDisplay(date)}</Text>
        </View>
        <Text style={styles.logoText}>Tıraş</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatCard label="Toplam" value={data?.todayCount ?? 0} color={c.primary} />
            <StatCard label="Bekleyen" value={data?.pendingCount ?? 0} color={c.accent} />
            <StatCard label="Tamamlanan" value={data?.completedCount ?? 0} color={c.success} />
            <StatCard label="Gelmedi" value={data?.noShowCount ?? 0} color={c.destructive} />
          </View>

          {/* Next appointment highlight */}
          {data?.nextAppointment && (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>Sıradaki Randevu</Text>
              <Text style={styles.nextTime}>
                {data.nextAppointment.startTime} — {data.nextAppointment.endTime}
              </Text>
              <Text style={styles.nextCustomer}>{data.nextAppointment.customerName}</Text>
            </View>
          )}

          {/* Today's list */}
          <Text style={styles.sectionTitle}>Bugünün Randevuları</Text>

          {!data?.todayAppointments?.length ? (
            <View style={styles.empty}>
              <Feather name="calendar" size={40} color={c.border} />
              <Text style={styles.emptyText}>Bugün randevu yok</Text>
            </View>
          ) : (
            data.todayAppointments.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt as any}
                role="barber"
                onPress={() => router.push(`/appointment/${appt.id}`)}
                onNoShow={() => handleStatusChange(appt.id, "no_show")}
                onCancel={() => handleStatusChange(appt.id, "cancelled")}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDateDisplay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground },
  dateLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 2 },
  logoText: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.primary, letterSpacing: 1 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderTopWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: c.mutedForeground, marginTop: 2, textAlign: "center" },
  nextCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: c.primary,
    borderRadius: colors.radius,
    padding: 16,
  },
  nextLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)", marginBottom: 4 },
  nextTime: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  nextCustomer: { fontSize: 15, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: c.foreground, paddingHorizontal: 20, marginBottom: 8 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.mutedForeground },
});
