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

  const { data: upcoming, isLoading, refetch, isRefetching } = useGetUpcomingAppointments();

  const cancelAppt = useUpdateAppointment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() }),
    },
  });

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Merhaba, {user?.name?.split(" ")[0]}</Text>
        <Text style={styles.logoText}>✂ Tıraş</Text>
      </View>

      <Text style={styles.sectionTitle}>Yaklaşan Randevularım</Text>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : !upcoming?.length ? (
        <View style={styles.empty}>
          <Feather name="calendar" size={48} color={c.border} />
          <Text style={styles.emptyTitle}>Randevu yok</Text>
          <Text style={styles.emptyText}>Aşağıdaki "Berberler" sekmesinden randevu alabilirsiniz</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
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
    paddingVertical: 16,
  },
  greeting: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground },
  logoText: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.primary },
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
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center" },
});
