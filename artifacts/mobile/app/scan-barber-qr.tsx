import { Feather } from "@expo/vector-icons";
import { useListBarbers } from "@workspace/api-client-react";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";
import {
  getBarberAccessCode,
  parseBarberAccessCode,
} from "@/utils/barberAccess";

const c = colors.light;

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type StatePanelProps = {
  icon: FeatherName;
  title: string;
  description: string;
  actionLabel?: string;
  actionPending?: boolean;
  errorMessage?: string | null;
  onAction?: () => void;
};

function StatePanel({
  icon,
  title,
  description,
  actionLabel,
  actionPending = false,
  errorMessage,
  onAction,
}: StatePanelProps) {
  return (
    <View style={styles.statePanel}>
      <View style={styles.stateIcon}>
        <Feather name={icon} size={30} color={c.accent} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {errorMessage ? (
        <View style={styles.stateError}>
          <Feather name="alert-circle" size={15} color={c.destructive} />
          <Text style={styles.stateErrorText}>{errorMessage}</Text>
        </View>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          disabled={actionPending}
          onPress={onAction}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            actionPending && styles.buttonDisabled,
          ]}
        >
          {actionPending ? (
            <ActivityIndicator size="small" color={c.primaryForeground} />
          ) : (
            <Feather name="camera" size={18} color={c.primaryForeground} />
          )}
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ScanBarberQrScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const {
    data: barbers,
    isLoading: barbersLoading,
    isError: barbersError,
    isFetching: barbersFetching,
    refetch: refetchBarbers,
  } = useListBarbers();

  const scanLockedRef = useRef(false);
  const rescanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [permissionPending, setPermissionPending] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (rescanTimerRef.current) {
        clearTimeout(rescanTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void getPermission().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [getPermission]);

  const handlePermissionAction = async () => {
    setPermissionPending(true);
    setPermissionError(null);

    try {
      if (permission && !permission.canAskAgain) {
        if (Platform.OS === "web") {
          setPermissionError(
            "Tarayıcınızın adres çubuğundaki kamera ayarından izni açıp sayfayı yenileyin.",
          );
          return;
        }

        await Linking.openSettings();
        return;
      }

      await requestPermission();
    } catch {
      setPermissionError(
        "Kamera izni istenemedi. Lütfen cihaz ayarlarınızı kontrol edin.",
      );
    } finally {
      setPermissionPending(false);
    }
  };

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scanLockedRef.current) return;

      scanLockedRef.current = true;
      setScanLocked(true);

      const accessCode = parseBarberAccessCode(data);
      if (!accessCode) {
        setScanError(
          "Bu QR kodu geçerli değil. Berberin 6 haneli QR kodunu taratın.",
        );
        return;
      }

      // TODO(backend): Resolve and persist the customer-barber relationship
      // through the same join-by-code endpoint used by manual entry.
      const barber = (barbers ?? []).find(
        (item) => getBarberAccessCode(item.id) === accessCode,
      );

      if (!barber) {
        setScanError("Bu koda ait aktif bir berber bulunamadı.");
        return;
      }

      setIsNavigating(true);
      router.replace(`/book/${barber.id}`);
    },
    [barbers],
  );

  const handleRescan = () => {
    setScanError(null);
    setIsNavigating(false);

    if (rescanTimerRef.current) {
      clearTimeout(rescanTimerRef.current);
    }

    rescanTimerRef.current = setTimeout(() => {
      scanLockedRef.current = false;
      setScanLocked(false);
      rescanTimerRef.current = null;
    }, 650);
  };

  const handleCameraRetry = () => {
    scanLockedRef.current = false;
    setScanLocked(false);
    setScanError(null);
    setCameraReady(false);
    setCameraError(null);
    setCameraKey((current) => current + 1);
  };

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 10);
  const bottomPadding = insets.bottom + (Platform.OS === "web" ? 20 : 14);

  let content: React.ReactNode;

  if (!permission) {
    content = (
      <StatePanel
        icon="camera"
        title="Kamera hazırlanıyor"
        description="Kamera izin durumu kontrol ediliyor…"
      />
    );
  } else if (!permission.granted) {
    const mustUseSettings = !permission.canAskAgain;
    content = (
      <StatePanel
        icon="camera-off"
        title={
          permission.status === "denied"
            ? "Kamera izni kapalı"
            : "Kamera erişimi gerekiyor"
        }
        description={
          mustUseSettings
            ? Platform.OS === "web"
              ? "QR kodunu taramak için tarayıcınızın site ayarlarından kamera iznini açın."
              : "QR kodunu taramak için cihaz ayarlarından Tıraş uygulamasına kamera izni verin."
            : "Berberinizin QR kodunu okuyabilmek için kamera erişimine izin verin."
        }
        actionLabel={
          mustUseSettings
            ? Platform.OS === "web"
              ? "İzin Ayarını Göster"
              : "Ayarları Aç"
            : "Kameraya İzin Ver"
        }
        actionPending={permissionPending}
        errorMessage={permissionError}
        onAction={() => void handlePermissionAction()}
      />
    );
  } else if (barbersLoading) {
    content = (
      <StatePanel
        icon="scissors"
        title="Berberler hazırlanıyor"
        description="QR kodunun eşleşeceği berber bilgileri yükleniyor…"
      />
    );
  } else if (barbersError) {
    content = (
      <StatePanel
        icon="wifi-off"
        title="Berberler yüklenemedi"
        description="İnternet bağlantınızı kontrol edip yeniden deneyin."
        actionLabel="Yeniden Dene"
        actionPending={barbersFetching}
        onAction={() => void refetchBarbers()}
      />
    );
  } else {
    content = (
      <View style={styles.scannerContent}>
        <View style={styles.cameraContainer}>
          <CameraView
            key={cameraKey}
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onCameraReady={() => {
              setCameraReady(true);
              setCameraError(null);
            }}
            onMountError={() => {
              setCameraReady(false);
              setCameraError(
                "Kamera başlatılamadı. Başka bir uygulama kamerayı kullanıyor olabilir.",
              );
            }}
            onBarcodeScanned={
              cameraReady && !scanLocked ? handleBarcodeScanned : undefined
            }
          />

          {!cameraReady && !cameraError ? (
            <View style={styles.cameraStatusOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.cameraStatusText}>Kamera açılıyor…</Text>
            </View>
          ) : null}

          {cameraError ? (
            <View style={styles.cameraStatusOverlay}>
              <View style={styles.cameraErrorIcon}>
                <Feather name="camera-off" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.cameraErrorTitle}>Kamera açılamadı</Text>
              <Text style={styles.cameraErrorText}>{cameraError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleCameraRetry}
                style={({ pressed }) => [
                  styles.lightButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Feather name="refresh-cw" size={17} color={c.primary} />
                <Text style={styles.lightButtonText}>Tekrar Dene</Text>
              </Pressable>
            </View>
          ) : null}

          {cameraReady && !cameraError ? (
            <>
              <View pointerEvents="none" style={styles.cameraHint}>
                <Feather name="maximize" size={16} color="#FFFFFF" />
                <Text style={styles.cameraHintText}>
                  QR kodu çerçeveye yerleştirin
                </Text>
              </View>

              <View pointerEvents="none" style={styles.scanTarget}>
                <View style={[styles.targetCorner, styles.targetTopLeft]} />
                <View style={[styles.targetCorner, styles.targetTopRight]} />
                <View style={[styles.targetCorner, styles.targetBottomLeft]} />
                <View style={[styles.targetCorner, styles.targetBottomRight]} />
                {!scanLocked ? <View style={styles.scanLine} /> : null}
              </View>

              {scanError ? (
                <View style={styles.scanResultCard}>
                  <View style={styles.resultMessageRow}>
                    <Feather
                      name="alert-circle"
                      size={20}
                      color={c.destructive}
                    />
                    <Text style={styles.resultErrorText}>{scanError}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleRescan}
                    style={({ pressed }) => [
                      styles.rescanButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Feather name="refresh-cw" size={17} color="#FFFFFF" />
                    <Text style={styles.rescanButtonText}>Yeniden Tara</Text>
                  </Pressable>
                </View>
              ) : null}

              {isNavigating ? (
                <View style={styles.scanResultCard}>
                  <View style={styles.resultMessageRow}>
                    <ActivityIndicator size="small" color={c.success} />
                    <Text style={styles.resultSuccessText}>
                      Berber bulundu, yönlendiriliyorsunuz…
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.securityNote}>
          <Feather name="shield" size={15} color={c.primary} />
          <Text style={styles.securityNoteText}>
            Yalnızca berberinizin paylaştığı QR kodunu taratın.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topPadding,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Geri dön"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Feather name="chevron-left" size={22} color={c.primary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>QR Kodunu Tara</Text>
            <Text style={styles.subtitle}>
              Berberine hızlıca eriş ve randevunu oluştur
            </Text>
          </View>
        </View>

        <View style={styles.content}>{content}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    paddingHorizontal: 16,
  },
  page: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: c.foreground,
    fontFamily: "Inter_700Bold",
    fontSize: 23,
  },
  subtitle: {
    color: c.mutedForeground,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  statePanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  stateIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 18,
  },
  stateTitle: {
    color: c.foreground,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  stateDescription: {
    color: c.mutedForeground,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 360,
    textAlign: "center",
  },
  stateError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "#FCEBEB",
    borderRadius: colors.radius,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
  },
  stateErrorText: {
    flex: 1,
    color: c.destructive,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 48,
    minWidth: 190,
    borderRadius: colors.radius,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    backgroundColor: c.primary,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: c.primaryForeground,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scannerContent: {
    flex: 1,
    gap: 12,
  },
  cameraContainer: {
    flex: 1,
    minHeight: 360,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#0D1714",
    borderWidth: 1,
    borderColor: c.border,
  },
  cameraStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10241F",
    paddingHorizontal: 28,
  },
  cameraStatusText: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginTop: 12,
  },
  cameraErrorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 14,
  },
  cameraErrorTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    textAlign: "center",
  },
  cameraErrorText: {
    color: "rgba(255,255,255,0.76)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 340,
    textAlign: "center",
  },
  lightButton: {
    minHeight: 44,
    borderRadius: colors.radius,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFFFFF",
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  lightButtonText: {
    color: c.primary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  cameraHint: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 19,
    backgroundColor: "rgba(12, 24, 20, 0.72)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  cameraHintText: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  scanTarget: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 238,
    height: 238,
    marginLeft: -119,
    marginTop: -135,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  targetCorner: {
    position: "absolute",
    width: 38,
    height: 38,
    borderColor: c.accent,
  },
  targetTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  targetTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  targetBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  targetBottomRight: {
    right: -2,
    bottom: -2,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 14,
  },
  scanLine: {
    position: "absolute",
    top: "50%",
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: c.accent,
    shadowColor: c.accent,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  scanResultCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 14,
  },
  resultMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultErrorText: {
    flex: 1,
    color: c.foreground,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
  },
  resultSuccessText: {
    flex: 1,
    color: c.success,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 19,
  },
  rescanButton: {
    minHeight: 42,
    borderRadius: colors.radius,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: c.primary,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rescanButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  securityNote: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: colors.radius,
    backgroundColor: c.secondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  securityNoteText: {
    flexShrink: 1,
    color: c.secondaryForeground,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
