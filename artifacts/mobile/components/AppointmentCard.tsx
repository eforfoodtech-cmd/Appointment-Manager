/**
 * Shared appointment card component for both barber and customer views.
 */
import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";
import { PressableScale } from "@/components/PressableScale";

const c = colors.light;

const STATUS_COLORS: Record<string, string> = {
  pending: c.warning,
  confirmed: c.success,
  cancelled: c.destructive,
  completed: c.primary,
  no_show: c.destructive,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  cancelled: "İptal",
  completed: "Tamamlandı",
  no_show: "Gelmedi",
};

interface Appointment {
  id: number;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  barberName: string;
  shopName: string;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  isManual?: boolean;
}

interface Props {
  appointment: Appointment;
  role: "barber" | "customer";
  onPress?: () => void;
  onNoShow?: () => void;
  onCancel?: () => void;
}

// Slot start has passed (Istanbul UTC+3, no DST)
function isSlotStarted(date: string, startTime: string): boolean {
  return Date.now() >= new Date(`${date}T${startTime}:00+03:00`).getTime();
}

// Customer can cancel only if more than 5 hours remain to slot start
function canCustomerCancel(date: string, startTime: string): boolean {
  const slotMs = new Date(`${date}T${startTime}:00+03:00`).getTime();
  return (slotMs - Date.now()) / 60000 > 5 * 60;
}

export function AppointmentCard({
  appointment: appt,
  role,
  onPress,
  onNoShow,
  onCancel,
}: Props) {
  const statusColor = STATUS_COLORS[appt.status] || c.mutedForeground;
  const statusLabel = STATUS_LABELS[appt.status] || appt.status;
  const isActive = appt.status === "confirmed" || appt.status === "pending";
  const slotStarted = isSlotStarted(appt.date, appt.startTime);
  const canCancelCust = canCustomerCancel(appt.date, appt.startTime);

  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      scaleTo={onPress ? 0.985 : 1}
    >
      {/* Time strip */}
      <View style={[styles.timeStrip, { backgroundColor: statusColor }]}>
        <Text style={styles.time}>{appt.startTime}</Text>
        <Text style={styles.timeSep}>–</Text>
        <Text style={styles.time}>{appt.endTime}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {role === "barber" ? appt.customerName : appt.shopName}
            </Text>
            {role === "barber" && appt.isManual && (
              <View style={styles.manualTag}>
                <Text style={styles.manualTagText}>Manuel</Text>
              </View>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.sub}>
          {role === "barber"
            ? appt.customerPhone || "Telefon yok"
            : appt.barberName}
        </Text>

        {appt.notes && (
          <Text style={styles.notes} numberOfLines={1}>
            {appt.notes}
          </Text>
        )}

        {/* Quick actions for barber */}
        {role === "barber" && isActive && (
          <View style={styles.actions}>
            {onNoShow && slotStarted && (
              <QuickBtn icon="user-x" color={c.warning} onPress={onNoShow} />
            )}
            {onCancel && (
              <QuickBtn
                icon="x"
                color={c.destructive}
                onPress={() =>
                  Alert.alert(
                    "Randevuyu İptal Et",
                    "Bu randevuyu iptal etmek istediğine emin misin?",
                    [
                      { text: "Vazgeç", style: "cancel" },
                      {
                        text: "İptal Et",
                        style: "destructive",
                        onPress: onCancel,
                      },
                    ],
                  )
                }
              />
            )}
          </View>
        )}

        {/* Cancel for customer — only when >5h remain */}
        {role === "customer" && isActive && onCancel && canCancelCust && (
          <PressableScale
            style={styles.cancelBtn}
            onPress={() =>
              Alert.alert(
                "İptal Et",
                "Bu randevuyu iptal etmek istiyor musunuz?",
                [
                  { text: "Hayır", style: "cancel" },
                  { text: "İptal Et", style: "destructive", onPress: onCancel },
                ],
              )
            }
          >
            <Text style={styles.cancelText}>İptal Et</Text>
          </PressableScale>
        )}
      </View>
    </PressableScale>
  );
}

function QuickBtn({
  icon,
  color,
  onPress,
}: {
  icon: any;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      style={[styles.quickBtn, { backgroundColor: color + "20" }]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      scaleTo={0.92}
    >
      <Feather name={icon} size={14} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderRadius: colors.radius,
    marginHorizontal: 20,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  timeStrip: {
    width: 62,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 2,
  },
  time: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  timeSep: { fontSize: 10, color: "rgba(255,255,255,0.7)" },
  content: { flex: 1, padding: 14, gap: 5 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.foreground,
    flexShrink: 1,
  },
  manualTag: {
    backgroundColor: "#EDE9FE",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  manualTagText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#7C3AED",
  },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  notes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
    fontStyle: "italic",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  quickBtn: { borderRadius: 8, padding: 7 },
  cancelBtn: { marginTop: 6, alignSelf: "flex-start" },
  cancelText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.destructive,
  },
});
