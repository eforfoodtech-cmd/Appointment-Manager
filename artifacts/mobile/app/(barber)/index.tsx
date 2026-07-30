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

  const handleStatusChange = (id: number, status: "cancelled" | "no_show") => {
    updateAppt.mutate({ appointmentId: id, data: { status } });
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={c.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerEyebrow}>Bugünün özeti</Text>
          <Text style={styles.greeting}>Merhaba ✂</Text>
          <Text style={styles.dateLabel}>{formatDateDisplay(date)}</Text>
        </View>
        <View style={styles.logoBadge}>
          <Feather name="scissors" size={18} color={c.accent} />
          <Text style={styles.logoText}>Tıraş</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <>
          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatCard
              label="Toplam"
              value={data?.todayCount ?? 0}
              color={c.primary}
              icon="calendar"
            />
            <StatCard
              label="Bekleyen"
              value={data?.pendingCount ?? 0}
              color={c.accent}
              icon="clock"
            />
            <StatCard
              label="Tamamlanan"
              value={data?.completedCount ?? 0}
              color={c.success}
              icon="check-circle"
            />
            <StatCard
              label="Gelmedi"
              value={data?.noShowCount ?? 0}
              color={c.destructive}
              icon="user-x"
            />
          </View>

          {/* Next appointment highlight */}
          {data?.nextAppointment && (
            <View style={styles.nextCard}>
              <View style={styles.nextHeader}>
                <View style={styles.nextIcon}>
                  <Feather name="clock" size={16} color={c.primary} />
                </View>
                <Text style={styles.nextLabel}>Sıradaki Randevu</Text>
              </View>
              <Text style={styles.nextTime}>
                {data.nextAppointment.startTime} —{" "}
                {data.nextAppointment.endTime}
              </Text>
              <Text style={styles.nextCustomer}>
                {data.nextAppointment.customerName}
              </Text>
            </View>
          )}

          {/* Today's list */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Bugünün Randevuları</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {data?.todayAppointments?.length ?? 0}
              </Text>
            </View>
          </View>

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
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: any;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={15} color={color} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerTitleBlock: { flex: 1 },
  headerEyebrow: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    marginBottom: 3,
  },
  greeting: { fontSize: 26, fontFamily: "Inter_700Bold", color: c.foreground },
  dateLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 2,
  },
  logoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: c.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.primary,
    letterSpacing: 0,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  statCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 14,
    borderTopWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    borderWidth: 1,
    borderColor: c.border,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  statValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
    flex: 1,
  },
  nextCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
    borderTopWidth: 4,
    borderTopColor: c.accent,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  nextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  nextIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.secondary,
    justifyContent: "center",
    alignItems: "center",
  },
  nextLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  nextTime: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.primary },
  nextCustomer: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: c.foreground,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
});
