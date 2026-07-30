import React, { useCallback, useMemo } from "react";
import {
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import colors from "@/constants/colors";
import { getBarberAccessCode, getBarberQrValue } from "@/utils/barberAccess";

const c = colors.light;

type BarberAccessCardProps = {
  barberId: number;
  shopName?: string | null;
  style?: StyleProp<ViewStyle>;
};

export function BarberAccessCard({
  barberId,
  shopName,
  style,
}: BarberAccessCardProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 370;
  const code = useMemo(() => getBarberAccessCode(barberId), [barberId]);
  const qrValue = useMemo(() => getBarberQrValue(code), [code]);
  const displayedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  const handleShare = useCallback(async () => {
    const shopLabel = shopName?.trim() || "Berberim";

    try {
      await Share.share({
        title: `${shopLabel} berber kodu`,
        message:
          `${shopLabel} için randevu almak üzere bu kodu kullan:\n\n` +
          `Berber kodu: ${code}\n${qrValue}`,
      });
    } catch {
      Alert.alert(
        "Paylaşım açılamadı",
        "Lütfen kısa bir süre sonra tekrar deneyin.",
      );
    }
  }, [code, qrValue, shopName]);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <Feather name="key" size={17} color={c.primaryForeground} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>BERBER ERİŞİMİ</Text>
          <Text style={styles.title}>Kodun ve QR kodun</Text>
        </View>
      </View>

      <View style={[styles.accessRow, isCompact && styles.accessRowCompact]}>
        <View
          style={[styles.codeSection, isCompact && styles.codeSectionCompact]}
        >
          <Text style={styles.codeLabel}>6 haneli kod</Text>
          <Text
            selectable
            accessibilityLabel={`Berber kodu ${code.split("").join(" ")}`}
            style={[styles.code, isCompact && styles.codeCompact]}
          >
            {displayedCode}
          </Text>
          <Text style={[styles.helper, isCompact && styles.helperCompact]}>
            Müşterilerin bu kodla sana ulaşabilir ve randevu alabilir.
          </Text>
        </View>

        <View
          accessible
          accessibilityLabel={`${shopName?.trim() || "Berber"} erişim QR kodu`}
          style={styles.qrFrame}
        >
          <QRCode
            value={qrValue}
            size={116}
            quietZone={8}
            color={c.primary}
            backgroundColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={styles.noteRow}>
        <Feather name="info" size={14} color="rgba(255,255,255,0.72)" />
        <Text style={styles.note}>
          QR kodu taratıldığında aynı berber kodu uygulamada açılır.
        </Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Berber kodunu paylaş"
        activeOpacity={0.82}
        onPress={handleShare}
        style={styles.shareButton}
      >
        <Feather name="share-2" size={17} color={c.primary} />
        <Text style={styles.shareButtonText}>Kodu paylaş</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: c.primary,
    borderRadius: colors.radius + 8,
    padding: 18,
    shadowColor: c.primary,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    color: c.accent,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.3,
    marginBottom: 2,
  },
  title: {
    color: c.primaryForeground,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  accessRowCompact: {
    flexDirection: "column",
  },
  codeSection: {
    flex: 1,
    minWidth: 0,
  },
  codeSectionCompact: {
    flex: 0,
    width: "100%",
    alignItems: "center",
  },
  codeLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  code: {
    color: c.primaryForeground,
    fontSize: 29,
    lineHeight: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.3,
  },
  codeCompact: {
    maxWidth: "100%",
    fontSize: 27,
    letterSpacing: 0.8,
    textAlign: "center",
  },
  helper: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 7,
  },
  helperCompact: {
    maxWidth: 240,
    textAlign: "center",
  },
  qrFrame: {
    padding: 7,
    borderRadius: colors.radius + 4,
    backgroundColor: "#FFFFFF",
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 16,
  },
  note: {
    flex: 1,
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
  shareButton: {
    minHeight: 44,
    marginTop: 14,
    borderRadius: colors.radius,
    backgroundColor: c.primaryForeground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareButtonText: {
    color: c.primary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
