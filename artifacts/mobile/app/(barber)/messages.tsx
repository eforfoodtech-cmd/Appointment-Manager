/**
 * Barber Messages — send and receive messages with customers.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  getListMessagesQueryKey,
  useListMessages,
  useSendMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const c = colors.light;

export default function BarberMessages() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCompose, setShowCompose] = useState(false);
  const [receiverIds, setReceiverIds] = useState("");
  const [content, setContent] = useState("");

  const { data: messages, isLoading } = useListMessages();

  const sendMessage = useSendMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
        setShowCompose(false);
        setContent("");
        setReceiverIds("");
      },
      onError: (err: any) => Alert.alert("Hata", err?.data?.error || "Mesaj gönderilemedi"),
    },
  });

  const handleSend = () => {
    const ids = receiverIds
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    if (ids.length === 0) {
      Alert.alert("Hata", "Geçerli bir müşteri ID girin");
      return;
    }
    if (!content.trim()) {
      Alert.alert("Hata", "Mesaj boş olamaz");
      return;
    }

    sendMessage.mutate({ data: { receiverIds: ids, content: content.trim() } });
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { paddingTop }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Mesajlar</Text>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => setShowCompose(true)}
          activeOpacity={0.8}
        >
          <Feather name="edit-2" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      ) : (
        <FlatList
          data={messages ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
                <View style={[styles.msgBubble, isSent && styles.msgBubbleSent]}>
                  <Text style={[styles.msgMeta, isSent && styles.msgMetaSent]}>
                    {isSent ? `→ ${msg.receiverName}` : `← ${msg.senderName}`}
                  </Text>
                  <Text style={[styles.msgContent, isSent && styles.msgContentSent]}>
                    {msg.content}
                  </Text>
                  <Text style={[styles.msgTime, isSent && styles.msgTimeSent]}>
                    {new Date(msg.createdAt).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Compose modal */}
      <Modal visible={showCompose} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mesaj Gönder</Text>
            <View style={{ gap: 6 }}>
              <Text style={styles.modalLabel}>Müşteri ID(ler) — virgülle ayırın</Text>
              <TextInput
                style={styles.input}
                value={receiverIds}
                onChangeText={setReceiverIds}
                placeholder="1, 2, 3"
                placeholderTextColor={c.mutedForeground}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.modalLabel}>Mesaj</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                value={content}
                onChangeText={setContent}
                placeholder="Mesajınızı yazın..."
                placeholderTextColor={c.mutedForeground}
                multiline
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowCompose(false)}
              >
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, sendMessage.isPending && { opacity: 0.7 }]}
                onPress={handleSend}
                disabled={sendMessage.isPending}
              >
                {sendMessage.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendText}>Gönder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground },
  composeBtn: {
    backgroundColor: c.primary,
    borderRadius: 20,
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  msgRow: { paddingHorizontal: 16, paddingVertical: 4, alignItems: "flex-start" },
  msgRowSent: { alignItems: "flex-end" },
  msgBubble: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 12,
    maxWidth: "80%",
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  msgBubbleSent: { backgroundColor: c.primary, borderColor: c.primary },
  msgMeta: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  msgMetaSent: { color: "rgba(255,255,255,0.7)" },
  msgContent: { fontSize: 15, fontFamily: "Inter_400Regular", color: c.foreground },
  msgContentSent: { color: "#fff" },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  msgTimeSent: { color: "rgba(255,255,255,0.6)" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground },
  modalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: c.mutedForeground },
  input: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.foreground,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: c.secondary, borderRadius: colors.radius, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
  sendBtn: { flex: 1, backgroundColor: c.primary, borderRadius: colors.radius, paddingVertical: 14, alignItems: "center" },
  sendText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
