import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  useListServices,
  createService,
  archiveService,
  useListCalendarExceptions,
  createCalendarException,
  deleteCalendarException,
  useListBarberCustomers,
  updateBarberCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import type { ListBarberCustomers200Item } from "@workspace/api-client-react";
import { updateService } from "@workspace/api-client-react";

export const businessStyles = StyleSheet.create({
  card: {
    margin: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 16,
    backgroundColor: colors.light.card,
  },
  title: { fontSize: 19, fontWeight: "700", color: colors.light.foreground },
  text: { color: colors.light.foreground, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 8,
    padding: 12,
    color: colors.light.foreground,
  },
  button: {
    padding: 12,
    backgroundColor: colors.light.primary,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600" },
  buttonSecondary: {
    backgroundColor: colors.light.secondary,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  buttonDanger: { backgroundColor: colors.light.destructive + "12" },
  buttonTextSecondary: { color: colors.light.primary },
  buttonTextDanger: { color: colors.light.destructive },
  helperBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderRadius: 10,
    backgroundColor: colors.light.secondary,
  },
  helperText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.light.mutedForeground,
  },
  subCard: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    backgroundColor: colors.light.background,
  },
  groupLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.light.mutedForeground,
  },
  customerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.secondary,
  },
  customerAvatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.light.primary,
  },
  customerCopy: { flex: 1, minWidth: 0 },
  customerName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.light.foreground,
  },
  customerMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.light.mutedForeground,
  },
  error: { color: colors.light.destructive },
  success: { color: colors.light.success, fontWeight: "600" },
});
const s = businessStyles;
export function SettingsSection({
  title,
  subtitle,
  icon = "settings",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={settingsStyles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          settingsStyles.row,
          open && settingsStyles.rowOpen,
          pressed && settingsStyles.rowPressed,
        ]}
      >
        <View style={settingsStyles.iconBox}>
          <Feather name={icon} size={19} color={colors.light.primary} />
        </View>
        <View style={settingsStyles.copy}>
          <Text style={settingsStyles.title}>{title}</Text>
          {subtitle ? (
            <Text style={settingsStyles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={settingsStyles.chevron}>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={19}
            color={colors.light.mutedForeground}
          />
        </View>
      </Pressable>
      {open ? <View style={settingsStyles.content}>{children}</View> : null}
    </View>
  );
}

const settingsStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 20, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 14,
    backgroundColor: colors.light.card,
  },
  rowOpen: {
    borderColor: colors.light.primary + "55",
    backgroundColor: colors.light.primary + "06",
  },
  rowPressed: { opacity: 0.75 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.secondary,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: "700", color: colors.light.foreground },
  subtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.light.mutedForeground,
  },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.muted,
  },
  content: { marginHorizontal: -20 },
});
export function Field({
  label,
  value,
  onChangeText,
  secure = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={s.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
      />
    </View>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        variant === "secondary" && s.buttonSecondary,
        variant === "danger" && s.buttonDanger,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          variant === "secondary" && s.buttonTextSecondary,
          variant === "danger" && s.buttonTextDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function BusinessSettings({
  barberId,
  showServices = true,
  showCalendar = true,
}: {
  barberId: number;
  showServices?: boolean;
  showCalendar?: boolean;
}) {
  const services = useListServices(barberId);
  const exceptions = useListCalendarExceptions();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("30");
  const [buffer, setBuffer] = useState("0");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [start, setStart] = useState("00:00");
  const [end, setEnd] = useState("24:00");
  const [reason, setReason] = useState("İzin");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setResult("");
    try {
      await action();
      await client.invalidateQueries();
    } catch (e: any) {
      setError(e?.data?.error || "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      {showServices ? <Text style={s.title}>Hizmetler ve fiyatlar</Text> : null}
      {(showServices && services.isError) ||
      (showCalendar && exceptions.isError) ? (
        <Text style={s.error}>Bilgiler alınamadı. Sayfayı yenileyin.</Text>
      ) : null}
      {showServices ? (
        <>
          {services.isLoading ? (
            <Text style={s.text}>Hizmetler yükleniyor…</Text>
          ) : null}
          {!services.isLoading && services.data?.length === 0 ? (
            <Text style={s.text}>
              Henüz hizmet eklenmemiş. Aşağıdaki formdan ilk hizmetinizi
              ekleyin.
            </Text>
          ) : null}
          {services.data?.map((item) => (
            <View key={item.id} style={{ gap: 6 }}>
              <Text style={s.text}>
                {item.name} · {(item.priceKurus / 100).toFixed(2)} ₺ ·{" "}
                {item.durationMinutes} dk + {item.bufferMinutes} dk ara
              </Text>
              <Action
                disabled={busy}
                title="Hizmeti düzenle"
                onPress={() => {
                  setEditingId(item.id);
                  setName(item.name);
                  setDescription(item.description);
                  setPrice(String(item.priceKurus / 100));
                  setDuration(String(item.durationMinutes));
                  setBuffer(String(item.bufferMinutes));
                }}
              />
              <Action
                disabled={busy}
                title="Hizmeti arşivle"
                onPress={() => run(() => archiveService(item.id))}
              />
            </View>
          ))}
          <Field label="Hizmet adı" value={name} onChangeText={setName} />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
          />
          <Field label="Fiyat (TL)" value={price} onChangeText={setPrice} />
          <Field
            label="Süre (dakika)"
            value={duration}
            onChangeText={setDuration}
          />
          <Field
            label="Hizmet sonrası ara (dakika)"
            value={buffer}
            onChangeText={setBuffer}
          />
          <Action
            disabled={busy || !name.trim() || !price.trim()}
            title={editingId ? "Hizmeti güncelle" : "Hizmet ekle"}
            onPress={() =>
              run(async () => {
                const data = {
                  name,
                  description,
                  priceKurus: Math.round(Number(price.replace(",", ".")) * 100),
                  durationMinutes: Number(duration),
                  bufferMinutes: Number(buffer),
                };
                if (editingId) await updateService(editingId, data);
                else await createService(data);
                setResult(
                  editingId ? "Hizmet güncellendi." : "Hizmet eklendi.",
                );
                setEditingId(null);
                setName("");
                setDescription("");
                setPrice("");
              })
            }
          />
          {result ? <Text style={s.success}>{result}</Text> : null}
          {editingId && (
            <Action
              title="Düzenlemekten vazgeç"
              onPress={() => {
                setEditingId(null);
                setName("");
                setPrice("");
              }}
            />
          )}
        </>
      ) : null}
      {showCalendar ? (
        <>
          <Text style={s.title}>İzin ve kapalı saatler</Text>
          <View style={s.helperBox}>
            <Feather name="info" size={16} color={colors.light.primary} />
            <Text style={s.helperText}>
              Tüm gün için 00:00–24:00 kullanın. Eklenen izinler mevcut
              randevuları değiştirmez.
            </Text>
          </View>
          {exceptions.data?.map((item) => (
            <View key={item.id} style={s.subCard}>
              <Text style={s.text}>
                {item.date} · {item.startTime}–{item.endTime} · {item.reason}
              </Text>
              <Action
                disabled={busy}
                title="Kapalı aralığı kaldır"
                variant="danger"
                onPress={() => run(() => deleteCalendarException(item.id))}
              />
            </View>
          ))}
          <Text style={s.groupLabel}>YENİ KAPALI ZAMAN</Text>
          <Field
            label="Tarih (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
          />
          <Field
            label="Bitiş tarihi (toplu kapatma için, isteğe bağlı)"
            value={endDate}
            onChangeText={setEndDate}
          />
          <Field
            label="Başlangıç (SS:DD)"
            value={start}
            onChangeText={setStart}
          />
          <Field label="Bitiş (SS:DD)" value={end} onChangeText={setEnd} />
          <Field
            label="Açıklama / neden"
            value={reason}
            onChangeText={setReason}
          />
          <Action
            disabled={busy}
            title="Kapalı aralık ekle"
            onPress={() =>
              run(() =>
                createCalendarException({
                  date,
                  endDate: endDate || undefined,
                  startTime: start,
                  endTime: end,
                  reason,
                }),
              )
            }
          />
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function CustomerDirectory() {
  const query = useListBarberCustomers();
  const [search, setSearch] = useState("");
  return (
    <View style={s.card}>
      <Text style={s.title}>Kayıtlı müşteriler</Text>
      <Field
        label="İsim, telefon veya etiket ara"
        value={search}
        onChangeText={setSearch}
      />
      {query.isLoading ? <Text>Yükleniyor…</Text> : null}
      {query.isError ? (
        <Action
          title="Müşteri listesini yeniden yükle"
          onPress={() => query.refetch()}
        />
      ) : null}
      {query.data
        ?.filter((item) =>
          `${item.name} ${item.phone ?? ""} ${item.tags}`
            .toLocaleLowerCase("tr")
            .includes(search.toLocaleLowerCase("tr")),
        )
        .map((item) => (
          <CustomerEditor
            key={item.id}
            item={item}
            refresh={() => query.refetch()}
          />
        ))}
      {query.data?.length === 0 ? (
        <Text style={s.text}>
          QR/kod ile bağlanan veya randevu alan müşteriler burada kalıcı olarak
          görünür.
        </Text>
      ) : null}
    </View>
  );
}
function CustomerEditor({
  item,
  refresh,
}: {
  item: ListBarberCustomers200Item;
  refresh: () => void;
}) {
  const [notes, setNotes] = useState(item.privateNotes);
  const [tags, setTags] = useState(item.tags);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <View style={s.subCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={s.customerHeader}
      >
        <View style={s.customerAvatar}>
          <Text style={s.customerAvatarText}>
            {item.name.charAt(0).toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
        <View style={s.customerCopy}>
          <Text style={s.customerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={s.customerMeta}>
            {item.visits} ziyaret · {item.noShows} gelmedi
          </Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.light.mutedForeground}
        />
      </Pressable>
      {open ? (
        <>
          <Text style={s.text}>{item.phone || "Telefon bilgisi yok"}</Text>
          <Text style={s.text}>
            Son ziyaret: {item.lastVisit || "Henüz yok"}
          </Text>
          <Field
            label="Özel not (yalnızca size görünür)"
            value={notes}
            onChangeText={setNotes}
          />
          <Field label="Etiketler" value={tags} onChangeText={setTags} />
          <Action
            disabled={busy}
            title="Müşteri notunu kaydet"
            onPress={async () => {
              setBusy(true);
              try {
                await updateBarberCustomer(item.id, {
                  privateNotes: notes,
                  tags,
                });
                setResult("Kaydedildi");
                refresh();
              } catch (e: any) {
                setResult(e?.data?.error || "Kaydedilemedi");
              } finally {
                setBusy(false);
              }
            }}
          />
          <Text style={s.text}>{result}</Text>
        </>
      ) : null}
    </View>
  );
}
