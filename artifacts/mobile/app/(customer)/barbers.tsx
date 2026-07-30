/**
 * Barber discovery — enter a six-digit barber code, scan a QR code,
 * or browse the public barber directory.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListBarbers } from "@workspace/api-client-react";

import colors from "@/constants/colors";
import {
  getBarberAccessCode,
  isValidBarberAccessCode,
  normalizeBarberAccessCode,
  parseBarberAccessCode,
} from "@/utils/barberAccess";

const c = colors.light;

export default function BarbersScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const handledDeepLinkCode = useRef<string | null>(null);
  const {
    data: barbers,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useListBarbers();
  const [accessCode, setAccessCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const sortedBarbers = useMemo(
    () =>
      [...(barbers ?? [])].sort((a, b) =>
        a.shopName.localeCompare(b.shopName, "tr"),
      ),
    [barbers],
  );
  const deepLinkCode = useMemo(() => {
    const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
    return parseBarberAccessCode(rawCode);
  }, [params.code]);

  useEffect(() => {
    if (deepLinkCode) setAccessCode(deepLinkCode);
  }, [deepLinkCode]);

  useEffect(() => {
    if (
      !deepLinkCode ||
      isLoading ||
      isError ||
      handledDeepLinkCode.current === deepLinkCode
    ) {
      return;
    }

    handledDeepLinkCode.current = deepLinkCode;
    const barber = sortedBarbers.find(
      (item) => getBarberAccessCode(item.id) === deepLinkCode,
    );

    if (barber) {
      router.replace(`/book/${barber.id}`);
      return;
    }

    setCodeError("QR kodundaki berber artık aktif görünmüyor.");
  }, [deepLinkCode, isError, isLoading, sortedBarbers]);

  const handleCodeChange = (value: string) => {
    setAccessCode(normalizeBarberAccessCode(value));
    if (codeError) setCodeError(null);
  };

  const handleFindBarber = () => {
    Keyboard.dismiss();

    if (!isValidBarberAccessCode(accessCode)) {
      setCodeError("Berber kodu 6 haneden oluşmalıdır.");
      return;
    }

    if (isLoading) {
      setCodeError("Berberler yükleniyor, lütfen kısa bir süre bekleyin.");
      return;
    }

    if (isError) {
      setCodeError("Berber bilgileri alınamadı. Lütfen yeniden deneyin.");
      return;
    }

    // TODO(backend): Replace this local directory lookup with the customer
    // join/resolve-by-code endpoint so the relationship is persisted.
    const barber = sortedBarbers.find(
      (item) => getBarberAccessCode(item.id) === accessCode,
    );

    if (!barber) {
      setCodeError("Bu kodla eşleşen aktif bir berber bulunamadı.");
      return;
    }

    setCodeError(null);
    router.push(`/book/${barber.id}`);
  };

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);
  const canSubmit = isValidBarberAccessCode(accessCode) && !isLoading;

  return (
    <View style={[styles.container, { paddingTop }]}>
      <FlatList
        data={isLoading || isError ? [] : sortedBarbers}
        keyExtractor={(barber) => String(barber.id)}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={c.primary}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 108 },
        ]}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Feather name="scissors" size={18} color={c.accent} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>HIZLI RANDEVU</Text>
                <Text style={styles.title}>Berberini bul</Text>
                <Text style={styles.subtitle}>
                  Berberinin kodunu gir veya QR kodunu okut.
                </Text>
              </View>
            </View>

            <View style={styles.accessCard}>
              <View style={styles.accessHeading}>
                <View style={styles.accessIcon}>
                  <Feather name="hash" size={18} color={c.accent} />
                </View>
                <View style={styles.accessHeadingCopy}>
                  <Text style={styles.accessTitle}>6 haneli berber kodu</Text>
                  <Text style={styles.accessDescription}>
                    Kodu berberinin “Müşteriler” ekranında bulabilirsin.
                  </Text>
                </View>
              </View>

              <TextInput
                accessibilityLabel="Altı haneli berber kodu"
                style={[
                  styles.codeInput,
                  codeError ? styles.codeInputError : null,
                ]}
                value={accessCode}
                onChangeText={handleCodeChange}
                onSubmitEditing={handleFindBarber}
                placeholder="000000"
                placeholderTextColor="rgba(255,255,255,0.28)"
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={6}
                autoCorrect={false}
                selectionColor={c.accent}
              />

              <View style={styles.codeMetaRow}>
                <View style={styles.secureNote}>
                  <Feather
                    name="shield"
                    size={13}
                    color="rgba(255,255,255,0.64)"
                  />
                  <Text style={styles.secureNoteText}>
                    Yalnızca rakamlardan oluşur
                  </Text>
                </View>
                <Text style={styles.codeCounter}>{accessCode.length}/6</Text>
              </View>

              {codeError ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={15} color="#FFD0C7" />
                  <Text style={styles.errorText}>{codeError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                accessibilityRole="button"
                style={[
                  styles.findButton,
                  !canSubmit ? styles.findButtonDisabled : null,
                ]}
                onPress={handleFindBarber}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.findButtonText,
                    !canSubmit ? styles.findButtonTextDisabled : null,
                  ]}
                >
                  Berberi bul
                </Text>
                <Feather
                  name="arrow-right"
                  size={18}
                  color={canSubmit ? c.primary : "rgba(23,72,62,0.42)"}
                />
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>veya</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                style={styles.scanButton}
                onPress={() => router.push("/scan-barber-qr" as Href)}
                activeOpacity={0.82}
              >
                <View style={styles.scanButtonIcon}>
                  <Feather name="maximize" size={18} color={c.accent} />
                </View>
                <View style={styles.scanButtonCopy}>
                  <Text style={styles.scanButtonTitle}>QR kodunu tara</Text>
                  <Text style={styles.scanButtonSubtitle}>
                    Kameranı açarak saniyeler içinde bağlan
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={19}
                  color="rgba(255,255,255,0.62)"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.directoryHeading}>
              <View>
                <Text style={styles.directoryEyebrow}>KEŞFET</Text>
                <Text style={styles.directoryTitle}>Tüm berberler</Text>
              </View>
              {!isLoading && !isError ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {sortedBarbers.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.state}>
              <ActivityIndicator color={c.primary} />
              <Text style={styles.stateText}>Berberler yükleniyor…</Text>
            </View>
          ) : isError ? (
            <View style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <Feather name="wifi-off" size={22} color={c.destructive} />
              </View>
              <Text style={styles.stateTitle}>Liste yüklenemedi</Text>
              <Text style={styles.stateText}>
                Bağlantını kontrol edip yeniden deneyebilirsin.
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => refetch()}
                activeOpacity={0.8}
              >
                <Feather name="refresh-cw" size={15} color={c.primary} />
                <Text style={styles.retryButtonText}>Yeniden dene</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <Feather name="scissors" size={22} color={c.accent} />
              </View>
              <Text style={styles.stateTitle}>Henüz berber yok</Text>
              <Text style={styles.stateText}>
                Aktif berberler burada listelenecek.
              </Text>
            </View>
          )
        }
        renderItem={({ item: barber }) => (
          <TouchableOpacity
            style={styles.barberCard}
            onPress={() => router.push(`/book/${barber.id}`)}
            activeOpacity={0.82}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {barber.shopName.charAt(0).toLocaleUpperCase("tr-TR")}
              </Text>
            </View>
            <View style={styles.barberCopy}>
              <Text style={styles.shopName} numberOfLines={1}>
                {barber.shopName}
              </Text>
              <Text style={styles.barberName} numberOfLines={1}>
                {barber.name}
              </Text>
              {barber.shopAddress ? (
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={12} color={c.mutedForeground} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {barber.shopAddress}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.cardAction}>
              <Feather name="arrow-up-right" size={17} color={c.primary} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingTop: 18,
    paddingBottom: 18,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.1,
    fontFamily: "Inter_700Bold",
    color: c.accent,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    marginTop: 3,
  },
  accessCard: {
    backgroundColor: c.primary,
    borderRadius: 18,
    padding: 18,
    shadowColor: c.primary,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  accessHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 16,
  },
  accessIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  accessHeadingCopy: { flex: 1, minWidth: 0 },
  accessTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_700Bold",
    color: c.primaryForeground,
  },
  accessDescription: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.68)",
    marginTop: 2,
  },
  codeInput: {
    height: 66,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 18,
    color: c.primaryForeground,
    textAlign: "center",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 9,
    fontFamily: "Inter_700Bold",
  },
  codeInputError: {
    borderColor: "#FFD0C7",
  },
  codeMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  secureNoteText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.58)",
  },
  codeCounter: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.64)",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 11,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
    color: "#FFD0C7",
  },
  findButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: c.accent,
    marginTop: 15,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  findButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  findButtonText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  findButtonTextDisabled: {
    color: "rgba(23,72,62,0.42)",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 15,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  orText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.46)",
  },
  scanButton: {
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scanButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(193,145,79,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanButtonCopy: { flex: 1, minWidth: 0 },
  scanButtonTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_700Bold",
    color: c.primaryForeground,
  },
  scanButtonSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.56)",
  },
  directoryHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  directoryEyebrow: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
    color: c.accent,
  },
  directoryTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  countBadge: {
    minWidth: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  barberCard: {
    minHeight: 82,
    backgroundColor: c.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    padding: 13,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  barberCopy: { flex: 1, minWidth: 0 },
  shopName: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  barberName: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
    color: c.mutedForeground,
    marginTop: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  cardAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  state: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 38,
    gap: 10,
  },
  stateCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },
  stateTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  stateText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    textAlign: "center",
    marginTop: 4,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: c.secondary,
  },
  retryButtonText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
});
