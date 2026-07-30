/**
 * Customer Messages — inbox from barbers.
 */
import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListMessages } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const c = colors.light;

export default function CustomerMessages() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: messages, isLoading } = useListMessages();

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { paddingTop }]}>
      <Text style={styles.title}>Mesajlar</Text>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <FlatList
          data={messages ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100, gap: 8 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={40} color={c.border} />
              <Text style={styles.emptyText}>Henüz mesaj yok</Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const isSent = msg.senderId === user?.id;
            return (
              <View style={[styles.msgRow, isSent && styles.msgRowSent]}>
                <View style={[styles.bubble, isSent && styles.bubbleSent]}>
                  <Text style={[styles.meta, isSent && styles.metaSent]}>
                    {isSent ? `→ ${msg.receiverName}` : `← ${msg.senderName}`}
                  </Text>
                  <Text style={[styles.content, isSent && styles.contentSent]}>
                    {msg.content}
                  </Text>
                  <Text style={[styles.time, isSent && styles.timeSent]}>
                    {new Date(msg.createdAt).toLocaleString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: c.foreground, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  msgRow: { alignItems: "flex-start" },
  msgRowSent: { alignItems: "flex-end" },
  bubble: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    padding: 12,
    maxWidth: "80%",
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  bubbleSent: { backgroundColor: c.primary, borderColor: c.primary },
  meta: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  metaSent: { color: "rgba(255,255,255,0.7)" },
  content: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.foreground },
  contentSent: { color: "#fff" },
  time: { fontSize: 11, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  timeSent: { color: "rgba(255,255,255,0.6)" },
});
