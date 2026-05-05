/**
 * Barber list — customer browses and selects a barber.
 */
import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useListBarbers } from "@workspace/api-client-react";
import colors from "@/constants/colors";

const c = colors.light;

export default function BarbersScreen() {
  const insets = useSafeAreaInsets();
  const { data: barbers, isLoading } = useListBarbers();

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { paddingTop }]}>
      <Text style={styles.title}>Berberler</Text>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <FlatList
          data={barbers ?? []}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 100,
            gap: 12,
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="scissors" size={40} color={c.border} />
              <Text style={styles.emptyText}>Henüz berber yok</Text>
            </View>
          }
          renderItem={({ item: barber }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/book/${barber.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {barber.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shopName}>{barber.shopName}</Text>
                <Text style={styles.barberName}>{barber.name}</Text>
                {barber.shopAddress && (
                  <View style={styles.locationRow}>
                    <Feather name="map-pin" size={12} color={c.mutedForeground} />
                    <Text style={styles.locationText}>{barber.shopAddress}</Text>
                  </View>
                )}
                {barber.bio && (
                  <Text style={styles.bio} numberOfLines={2}>{barber.bio}</Text>
                )}
              </View>
              <Feather name="chevron-right" size={20} color={c.mutedForeground} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  card: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  shopName: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
  barberName: { fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 2 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  locationText: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  bio: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 4 },
});
