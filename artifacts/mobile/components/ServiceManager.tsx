import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  archiveService,
  createService,
  getListServicesQueryKey,
  updateService,
  useListServices,
} from "@workspace/api-client-react";
import type { ListServices200Item } from "@workspace/api-client-react";
import colors from "@/constants/colors";
import { Alert } from "@/utils/alert";

const c = colors.light;

type ServiceItem = ListServices200Item;

const initialForm = {
  name: "",
  description: "",
  price: "",
  duration: "30",
  buffer: "0",
};

export function ServiceManager({ barberId }: { barberId: number }) {
  const queryClient = useQueryClient();
  const services = useListServices(barberId);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [error, setError] = useState("");

  const closeForm = () => {
    if (busy) return;
    setModalVisible(false);
    setEditingId(null);
    setForm(initialForm);
    setError("");
  };

  const openNew = () => {
    setEditingId(null);
    setForm(initialForm);
    setError("");
    setModalVisible(true);
  };

  const openEdit = (item: ServiceItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description,
      price: String(item.priceKurus / 100).replace(".", ","),
      duration: String(item.durationMinutes),
      buffer: String(item.bufferMinutes),
    });
    setError("");
    setModalVisible(true);
  };

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListServicesQueryKey(barberId),
    });

  const save = async () => {
    const price = Number(form.price.replace(",", "."));
    const duration = Number(form.duration);
    const buffer = Number(form.buffer);

    if (!form.name.trim()) {
      setError("Hizmet adı zorunludur.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Geçerli bir fiyat girin.");
      return;
    }
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      setError("Süre 5–480 dakika arasında olmalıdır.");
      return;
    }
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
      setError("Ara süresi 0–120 dakika arasında olmalıdır.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        priceKurus: Math.round(price * 100),
        durationMinutes: duration,
        bufferMinutes: buffer,
      };
      if (editingId) await updateService(editingId, data);
      else await createService(data);
      await refresh();
      setMessageIsError(false);
      setMessage(editingId ? "Hizmet güncellendi." : "Yeni hizmet eklendi.");
      setModalVisible(false);
      setEditingId(null);
      setForm(initialForm);
    } catch (e: any) {
      setError(e?.data?.error || "Hizmet kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const confirmArchive = (item: ServiceItem) => {
    Alert.alert(
      "Hizmeti arşivle",
      "“" + item.name + "” müşterilerin hizmet listesinde artık görünmeyecek.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Arşivle",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setMessage("");
            setMessageIsError(false);
            try {
              await archiveService(item.id);
              await refresh();
              setMessage("Hizmet arşivlendi.");
            } catch (e: any) {
              setMessageIsError(true);
              setMessage(e?.data?.error || "Hizmet arşivlenemedi.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.content}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Feather name="scissors" size={21} color={c.primary} />
        </View>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>Hizmet menünüz</Text>
          <Text style={styles.summarySubtitle}>
            {services.data?.length ?? 0} aktif hizmet
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openNew}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Yeni</Text>
        </Pressable>
      </View>

      {message ? (
        <View
          style={[
            styles.messageBanner,
            messageIsError && styles.messageBannerError,
          ]}
        >
          <Feather
            name={messageIsError ? "alert-circle" : "check-circle"}
            size={17}
            color={messageIsError ? c.destructive : c.success}
          />
          <Text
            style={[
              styles.messageText,
              messageIsError && styles.messageTextError,
            ]}
          >
            {message}
          </Text>
        </View>
      ) : null}

      {services.isLoading ? (
        <ActivityIndicator style={styles.loader} color={c.primary} />
      ) : services.isError ? (
        <View style={styles.emptyCard}>
          <Feather name="alert-circle" size={25} color={c.destructive} />
          <Text style={styles.emptyTitle}>Hizmetler yüklenemedi</Text>
          <Pressable
            onPress={() => services.refetch()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : services.data?.length ? (
        <View style={styles.listSection}>
          <Text style={styles.sectionLabel}>AKTİF HİZMETLER</Text>
          {services.data.map((item) => (
            <View key={item.id} style={styles.serviceCard}>
              <View style={styles.serviceTopRow}>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{item.name}</Text>
                  <Text style={styles.price}>
                    {(item.priceKurus / 100).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    ₺
                  </Text>
                </View>
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Aktif</Text>
                </View>
              </View>
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Feather name="clock" size={14} color={c.mutedForeground} />
                  <Text style={styles.metaText}>{item.durationMinutes} dk</Text>
                </View>
                {item.bufferMinutes ? (
                  <View style={styles.metaChip}>
                    <Feather
                      name="coffee"
                      size={14}
                      color={c.mutedForeground}
                    />
                    <Text style={styles.metaText}>
                      {item.bufferMinutes} dk ara
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  disabled={busy}
                  onPress={() => openEdit(item)}
                  style={({ pressed }) => [
                    styles.editButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name="edit-2" size={15} color={c.primary} />
                  <Text style={styles.editText}>Düzenle</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => confirmArchive(item)}
                  style={({ pressed }) => [
                    styles.archiveButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name="archive" size={15} color={c.destructive} />
                  <Text style={styles.archiveText}>Arşivle</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Feather name="scissors" size={25} color={c.primary} />
          </View>
          <Text style={styles.emptyTitle}>İlk hizmetinizi ekleyin</Text>
          <Text style={styles.emptyText}>
            Hizmetleriniz müşterilere randevu ekranında gösterilir.
          </Text>
          <Pressable onPress={openNew} style={styles.emptyAddButton}>
            <Feather name="plus" size={17} color="#fff" />
            <Text style={styles.addButtonText}>Hizmet ekle</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeForm} />
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderText}>
                <Text style={styles.formTitle}>
                  {editingId ? "Hizmeti düzenle" : "Yeni hizmet"}
                </Text>
                <Text style={styles.formSubtitle}>
                  Müşteriye gösterilecek bilgileri girin.
                </Text>
              </View>
              <Pressable onPress={closeForm} hitSlop={10} disabled={busy}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <FormField
                label="Hizmet adı"
                placeholder="Örn. Saç kesimi"
                value={form.name}
                onChangeText={(name) =>
                  setForm((value) => ({ ...value, name }))
                }
              />
              <FormField
                label="Açıklama"
                placeholder="Hizmetin kısa açıklaması"
                value={form.description}
                multiline
                onChangeText={(description) =>
                  setForm((value) => ({ ...value, description }))
                }
              />
              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <FormField
                    label="Fiyat (₺)"
                    placeholder="300"
                    value={form.price}
                    keyboardType="decimal-pad"
                    onChangeText={(price) =>
                      setForm((value) => ({ ...value, price }))
                    }
                  />
                </View>
                <View style={styles.formColumn}>
                  <FormField
                    label="Süre (dk)"
                    placeholder="30"
                    value={form.duration}
                    keyboardType="number-pad"
                    onChangeText={(duration) =>
                      setForm((value) => ({ ...value, duration }))
                    }
                  />
                </View>
              </View>
              <FormField
                label="Hizmet sonrası ara (dk)"
                hint="Bir sonraki randevudan önceki hazırlık süresi"
                placeholder="0"
                value={form.buffer}
                keyboardType="number-pad"
                onChangeText={(buffer) =>
                  setForm((value) => ({ ...value, buffer }))
                }
              />
              {error ? (
                <View style={styles.errorBanner}>
                  <Feather
                    name="alert-circle"
                    size={16}
                    color={c.destructive}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <View style={styles.formActions}>
                <Pressable
                  disabled={busy}
                  onPress={closeForm}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>Vazgeç</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={save}
                  style={[styles.saveButton, busy && styles.disabled]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={17} color="#fff" />
                      <Text style={styles.saveText}>
                        {editingId ? "Güncelle" : "Hizmeti ekle"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FormField({
  label,
  hint,
  multiline = false,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={c.mutedForeground}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
  },
  summaryText: { flex: 1 },
  summaryTitle: { fontSize: 16, fontWeight: "700", color: c.foreground },
  summarySubtitle: { marginTop: 2, fontSize: 12, color: c.mutedForeground },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  addButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  messageBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: c.success + "12",
    borderWidth: 1,
    borderColor: c.success + "35",
  },
  messageText: { color: c.success, fontSize: 13, fontWeight: "600" },
  messageBannerError: {
    backgroundColor: c.destructive + "10",
    borderColor: c.destructive + "30",
  },
  messageTextError: { color: c.destructive },
  loader: { marginVertical: 40 },
  listSection: { gap: 10 },
  sectionLabel: {
    marginLeft: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: c.mutedForeground,
  },
  serviceCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  serviceTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 16, fontWeight: "700", color: c.foreground },
  price: { marginTop: 4, fontSize: 20, fontWeight: "700", color: c.primary },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: c.success + "12",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.success,
  },
  activeText: { fontSize: 11, fontWeight: "700", color: c.success },
  description: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 19,
    color: c.mutedForeground,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.muted,
  },
  metaText: { fontSize: 12, fontWeight: "600", color: c.mutedForeground },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  editButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: c.secondary,
  },
  editText: { color: c.primary, fontSize: 13, fontWeight: "700" },
  archiveButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: c.destructive + "10",
  },
  archiveText: { color: c.destructive, fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.foreground },
  emptyText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: c.mutedForeground,
  },
  emptyAddButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  retryButton: { paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: c.primary, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(30,37,34,0.52)",
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  formCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    alignSelf: "center",
    padding: 20,
    borderRadius: 18,
    backgroundColor: c.card,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  formHeaderText: { flex: 1 },
  formTitle: { fontSize: 20, fontWeight: "700", color: c.foreground },
  formSubtitle: { marginTop: 3, fontSize: 12, color: c.mutedForeground },
  field: { gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: c.foreground },
  fieldHint: { marginTop: -2, fontSize: 11, color: c.mutedForeground },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.background,
    color: c.foreground,
    fontSize: 14,
  },
  multilineInput: { minHeight: 82, textAlignVertical: "top" },
  formRow: { flexDirection: "row", gap: 10 },
  formColumn: { flex: 1 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderRadius: 9,
    backgroundColor: c.destructive + "10",
    marginBottom: 14,
  },
  errorText: { flex: 1, color: c.destructive, fontSize: 12 },
  formActions: { flexDirection: "row", gap: 10 },
  cancelButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  cancelText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  saveButton: {
    flex: 1.5,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
