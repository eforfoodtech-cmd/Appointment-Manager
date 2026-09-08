import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAccount,
  updateAccount,
  changeAccountPassword,
  logoutAllSessions,
  deleteAccount,
  saveAccountMedia,
  requestContactVerification,
  confirmContactVerification,
  useListAccountSessions,
  revokeAccountSession,
  useListNotifications,
  readNotification,
  getMe,
  useGetBarberMedia,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Action, Field, businessStyles as s } from "./BusinessSettings";
import colors from "@/constants/colors";

const c = colors.light;

function SettingsGroup({
  title,
  subtitle,
  icon,
  danger = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const color = danger ? c.destructive : c.primary;
  return (
    <View style={groupStyles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [
          groupStyles.groupHeader,
          open && groupStyles.groupHeaderOpen,
          pressed && { opacity: 0.75 },
        ]}
      >
        <View
          style={[groupStyles.groupIcon, danger && groupStyles.groupIconDanger]}
        >
          <Feather name={icon} size={17} color={color} />
        </View>
        <View style={groupStyles.groupCopy}>
          <Text
            style={[groupStyles.groupTitle, danger && { color: c.destructive }]}
          >
            {title}
          </Text>
          <Text style={groupStyles.groupSubtitle}>{subtitle}</Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.mutedForeground}
        />
      </Pressable>
      {open ? <View style={groupStyles.groupContent}>{children}</View> : null}
    </View>
  );
}

export function AccountSettings() {
  const { user, token, setAuth, logout } = useAuth();
  const account = useGetAccount();
  const sessions = useListAccountSessions();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<number | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (account.data) {
      setName(account.data.name);
      setEmail(account.data.email);
      setPhone(account.data.phone ?? "");
    }
  }, [account.data]);
  async function run(action: () => Promise<unknown>, message = "Kaydedildi") {
    if (busy) return;
    setBusy(true);
    setResult("");
    try {
      await action();
      setResult(message);
      await client.invalidateQueries();
    } catch (e: any) {
      setResult(e?.data?.error || "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }
  async function pickImage(gallery: boolean) {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.55,
      allowsEditing: !gallery,
    });
    if (picked.canceled || !picked.assets[0]?.base64) return;
    const asset = picked.assets[0];
    const image = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
    await saveAccountMedia({
      avatar: gallery ? (account.data?.avatar ?? null) : image,
      gallery: gallery
        ? [...(account.data?.gallery ?? []), image]
        : (account.data?.gallery ?? []),
    });
  }
  return (
    <View style={s.card}>
      <Text style={s.title}>Hesap ve güvenlik</Text>
      {account.isError ? (
        <Action
          title="Hesap bilgilerini yeniden yükle"
          onPress={() => account.refetch()}
        />
      ) : null}
      {result ? (
        <Text accessibilityRole="alert" style={s.text}>
          {result}
        </Text>
      ) : null}
      <SettingsGroup
        title="Fotoğraflar ve galeri"
        subtitle="Profil görseli ve çalışma örnekleri"
        icon="image"
      >
        {account.data?.avatar ? (
          <Image
            source={{ uri: account.data.avatar }}
            style={{ width: 100, height: 100, borderRadius: 50 }}
          />
        ) : null}
        <Action
          disabled={busy || !account.data}
          title="Profil fotoğrafı / logo yükle"
          onPress={() => run(() => pickImage(false))}
        />
        {account.data?.avatar && (
          <Action
            disabled={busy}
            title="Profil fotoğrafını kaldır"
            variant="danger"
            onPress={() =>
              run(() =>
                saveAccountMedia({
                  avatar: null,
                  gallery: account.data?.gallery ?? [],
                }),
              )
            }
          />
        )}
        {user?.role === "barber" && (
          <>
            <Text style={s.title}>İşletme ve çalışmalar</Text>
            <ScrollView horizontal>
              {account.data?.gallery.map((uri, i) => (
                <View key={i} style={{ marginRight: 8 }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 120, height: 120, borderRadius: 10 }}
                  />
                  <Action
                    disabled={busy}
                    title="Kaldır"
                    variant="danger"
                    onPress={() =>
                      run(() =>
                        saveAccountMedia({
                          avatar: account.data?.avatar ?? null,
                          gallery: account.data!.gallery.filter(
                            (_, n) => n !== i,
                          ),
                        }),
                      )
                    }
                  />
                </View>
              ))}
            </ScrollView>
            <Action
              disabled={
                busy ||
                !account.data ||
                (account.data?.gallery.length ?? 0) >= 6
              }
              title="Galeriye fotoğraf ekle"
              onPress={() => run(() => pickImage(true))}
            />
          </>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="İletişim ve doğrulama"
        subtitle="Ad, e-posta ve telefon bilgileri"
        icon="user"
      >
        <Field label="Ad soyad" value={name} onChangeText={setName} />
        <Field label="E-posta" value={email} onChangeText={setEmail} />
        <Field
          label="Telefon (başında 0 olmadan)"
          value={phone}
          onChangeText={setPhone}
        />
        <Field
          label="Mevcut şifre (değişiklikleri doğrulamak için)"
          value={password}
          onChangeText={setPassword}
          secure
        />
        <Action
          disabled={busy}
          title="Hesap bilgilerini kaydet"
          onPress={() =>
            run(async () => {
              await updateAccount({
                name,
                email,
                phone,
                currentPassword: password,
              });
              if (token) {
                const updated = await getMe();
                await setAuth(token, {
                  ...updated,
                  phone: updated.phone ?? null,
                });
              }
            })
          }
        />
        <Text style={s.text}>
          E-posta:{" "}
          {account.data?.emailVerifiedAt ? "Doğrulandı" : "Doğrulanmadı"} ·
          Telefon:{" "}
          {account.data?.phoneVerifiedAt ? "Doğrulandı" : "Doğrulanmadı"}
        </Text>
        <Action
          disabled={busy}
          title="E-posta doğrulama kodu gönder"
          onPress={() =>
            run(
              async () =>
                setVerificationId(
                  (await requestContactVerification({ channel: "email" })).id,
                ),
              "Kayıtlı e-postanıza kod gönderildi.",
            )
          }
        />
        <Action
          disabled={busy}
          title="Telefon doğrulama kodu gönder"
          onPress={() =>
            run(
              async () =>
                setVerificationId(
                  (await requestContactVerification({ channel: "phone" })).id,
                ),
              "Kayıtlı telefonunuza kod gönderildi.",
            )
          }
        />
        {verificationId != null && (
          <>
            <Field
              label="6 haneli doğrulama kodu"
              value={code}
              onChangeText={setCode}
            />
            <Action
              disabled={busy}
              title="Kodu doğrula"
              onPress={() =>
                run(async () => {
                  await confirmContactVerification({
                    id: verificationId,
                    code,
                  });
                  setVerificationId(null);
                }, "Doğrulandı")
              }
            />
          </>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="Şifre"
        subtitle="Hesap parolanızı güvenli biçimde değiştirin"
        icon="lock"
      >
        <Field
          label="Yeni şifre"
          value={newPassword}
          onChangeText={setNewPassword}
          secure
        />
        <Action
          disabled={busy}
          title="Şifreyi değiştir ve çıkış yap"
          onPress={() =>
            run(async () => {
              await changeAccountPassword({
                currentPassword: password,
                newPassword,
              });
              await logout();
            })
          }
        />
      </SettingsGroup>
      <SettingsGroup
        title="Cihaz oturumları"
        subtitle={`${sessions.data?.length ?? 0} açık oturum`}
        icon="smartphone"
      >
        {sessions.data?.map((session) => (
          <View key={session.id} style={{ gap: 6 }}>
            <Text style={s.text}>
              {session.current ? "Bu cihaz · " : ""}
              {session.device}
            </Text>
            <Text style={s.text}>
              {new Date(session.lastSeenAt).toLocaleString("tr-TR")}
            </Text>
            <Action
              disabled={busy}
              title="Oturumu kapat"
              variant="secondary"
              onPress={() =>
                run(async () => {
                  await revokeAccountSession(session.id);
                  if (session.current) await logout();
                })
              }
            />
          </View>
        ))}
        <Action
          disabled={busy}
          title="Tüm cihazlardan çıkış yap"
          variant="secondary"
          onPress={() =>
            run(async () => {
              await logoutAllSessions();
              await logout();
            })
          }
        />
      </SettingsGroup>
      <SettingsGroup
        title="Hesabı sil"
        subtitle="Hesabı ve kişisel verileri kalıcı olarak kaldırın"
        icon="trash-2"
        danger
      >
        <Text style={s.text}>
          Aktif randevular kapatıldıktan sonra kişisel hesap bilgileri ve
          görseller kaldırılır. Randevu kayıtları anonim olarak korunur. Bu
          işlem geri alınamaz.
        </Text>
        <Field
          label="Onay için HESABIMI SİL yazın"
          value={confirmation}
          onChangeText={setConfirmation}
        />
        <Action
          disabled={busy || confirmation !== "HESABIMI SİL" || !password}
          title="Hesabımı kalıcı olarak sil"
          variant="danger"
          onPress={() =>
            run(async () => {
              await deleteAccount({ currentPassword: password, confirmation });
              await logout();
            })
          }
        />
      </SettingsGroup>
    </View>
  );
}

export function NotificationInbox() {
  const query = useListNotifications({
    query: { queryKey: ["/api/notifications"], refetchInterval: 30000 },
  });
  const [error, setError] = useState("");
  return (
    <View style={s.card}>
      <View style={groupStyles.notificationHeader}>
        <View>
          <Text style={s.title}>Son bildirimler</Text>
          <Text style={groupStyles.notificationHint}>
            Randevu hareketleri burada görünür.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Bildirimleri yenile"
          onPress={() => query.refetch()}
          style={groupStyles.refreshButton}
        >
          <Feather name="refresh-cw" size={16} color={c.primary} />
        </Pressable>
      </View>
      {query.isLoading ? <Text style={s.text}>Yükleniyor…</Text> : null}
      {query.isError ? (
        <Text style={s.error}>Bildirimler yüklenemedi.</Text>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      {query.data?.length === 0 ? (
        <View style={groupStyles.notificationEmpty}>
          <Feather name="bell" size={22} color={c.mutedForeground} />
          <Text style={s.text}>Henüz bildirim yok.</Text>
        </View>
      ) : null}
      {query.data?.map((item) => (
        <Pressable
          key={item.id}
          style={[
            groupStyles.notificationCard,
            !item.readAt && groupStyles.notificationUnread,
          ]}
          onPress={async () => {
            try {
              await readNotification(item.id);
              await query.refetch();
              if (item.appointmentId)
                router.push(`/appointment/${item.appointmentId}`);
            } catch {
              setError("Bildirim açılamadı.");
            }
          }}
        >
          <View style={groupStyles.notificationTop}>
            {!item.readAt ? <View style={groupStyles.unreadDot} /> : null}
            <Text
              style={[
                groupStyles.notificationTitle,
                !item.readAt && { fontWeight: "700" },
              ]}
            >
              {item.title}
            </Text>
            <Text style={groupStyles.notificationDate}>
              {new Date(item.createdAt).toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "short",
              })}
            </Text>
          </View>
          <Text style={groupStyles.notificationBody}>{item.body}</Text>
          <View style={groupStyles.notificationLink}>
            <Text style={groupStyles.notificationLinkText}>
              {item.appointmentId ? "Randevuyu aç" : "Okundu işaretle"}
            </Text>
            <Feather name="chevron-right" size={15} color={c.primary} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
export function BarberMedia({ barberId }: { barberId: number }) {
  const query = useGetBarberMedia(barberId);
  if (!query.data) return null;
  const images = [query.data.avatar, ...query.data.gallery].filter(
    (v): v is string => !!v,
  );
  if (!images.length) return null;
  return (
    <ScrollView horizontal style={{ margin: 20 }}>
      {images.map((uri, i) => (
        <Image
          key={i}
          source={{ uri }}
          accessibilityLabel={i === 0 ? "İşletme fotoğrafı" : "Çalışma örneği"}
          style={{ width: 160, height: 160, borderRadius: 12, marginRight: 10 }}
        />
      ))}
    </ScrollView>
  );
}

const groupStyles = StyleSheet.create({
  group: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: c.card,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    backgroundColor: c.card,
  },
  groupHeaderOpen: { backgroundColor: c.primary + "06" },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
  },
  groupIconDanger: { backgroundColor: c.destructive + "10" },
  groupCopy: { flex: 1, minWidth: 0 },
  groupTitle: { fontSize: 13, fontWeight: "700", color: c.foreground },
  groupSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: c.mutedForeground,
  },
  groupContent: {
    gap: 11,
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.background,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  notificationHint: {
    marginTop: -8,
    fontSize: 11,
    color: c.mutedForeground,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
  },
  notificationEmpty: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 20,
  },
  notificationCard: {
    gap: 7,
    padding: 13,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 11,
    backgroundColor: c.background,
  },
  notificationUnread: {
    borderColor: c.primary + "45",
    backgroundColor: c.primary + "06",
  },
  notificationTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.accent,
  },
  notificationTitle: { flex: 1, fontSize: 13, color: c.foreground },
  notificationDate: { fontSize: 10, color: c.mutedForeground },
  notificationBody: { fontSize: 12, lineHeight: 17, color: c.mutedForeground },
  notificationLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
  },
  notificationLinkText: { fontSize: 11, fontWeight: "700", color: c.primary },
});
