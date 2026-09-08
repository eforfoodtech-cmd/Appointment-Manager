import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMyBarberProfile } from "@workspace/api-client-react";
import { ServiceManager } from "@/components/ServiceManager";
import colors from "@/constants/colors";

const c = colors.light;

export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const profile = useGetMyBarberProfile();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Hizmetler</Text>
        <Text style={styles.subtitle}>
          Müşterilerin randevu sırasında seçebileceği hizmetleri yönetin.
        </Text>
      </View>
      {profile.isLoading ? (
        <ActivityIndicator style={styles.loader} color={c.primary} />
      ) : profile.data ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        >
          <ServiceManager barberId={profile.data.id} />
        </ScrollView>
      ) : (
        <Text style={styles.error}>Berber profili yüklenemedi.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: "700", color: c.foreground },
  subtitle: { marginTop: 5, fontSize: 13, color: c.mutedForeground },
  loader: { marginTop: 40 },
  error: { margin: 20, color: c.destructive },
});
