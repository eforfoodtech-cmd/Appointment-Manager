/**
 * Customer Home — upcoming appointments.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getGetUpcomingAppointmentsQueryKey,
  useGetUpcomingAppointments,
  useUpdateAppointment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { AppointmentCard } from "@/components/AppointmentCard";
import colors from "@/constants/colors";

const c = colors.light;

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: upcoming,
    isLoading,
    refetch,
    isRefetching,
  } = useGetUpcomingAppointments();

  const cancelAppt = useUpdateAppointment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetUpcomingAppointmentsQueryKey(),
        }),
    },
  });

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
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Tıraş</Text>
          <Text style={styles.greeting}>
            Merhaba, {user?.name?.split(" ")[0]}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => router.push("/(customer)/barbers")}
        >
          <Feather name="scissors" size={18} color={c.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Yaklaşan randevu</Text>
          <Text style={styles.summaryValue}>{upcoming?.length ?? 0}</Text>
        </View>
        <View style={styles.summaryIcon}>
          <Feather name="calendar" size={22} color={c.accent} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Yaklaşan Randevularım</Text>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : !upcoming?.length ? (
        <View style={styles.empty}>
          <Feather name="calendar" size={48} color={c.border} />
          <Text style={styles.emptyTitle}>Randevu yok</Text>
          <Text style={styles.emptyText}>
            Aşağıdaki "Berberler" sekmesinden randevu alabilirsiniz
          </Text>
        </View>
      ) : (
        <View>
          {upcoming.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt as any}
              role="customer"
              onPress={() => router.push(`/appointment/${appt.id}`)}
              onCancel={() =>
                cancelAppt.mutate({
                  appointmentId: appt.id,
                  data: { status: "cancelled" },
                })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.accent,
    marginBottom: 3,
  },
  greeting: { fontSize: 24, fontFamily: "Inter_700Bold", color: c.foreground },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderTopWidth: 4,
    borderTopColor: c.accent,
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
  },
  summaryValue: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: c.primary,
    marginTop: 2,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.secondary,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    textAlign: "center",
  },
});
