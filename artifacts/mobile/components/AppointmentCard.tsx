/**
 * Shared appointment card component for both barber and customer views.
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";

const c = colors.light;

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#10B981",
  cancelled: "#EF4444",
  completed: "#6366F1",
  no_show: "#EF4444",
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
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
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
          <Text style={styles.name}>
            {role === "barber" ? appt.customerName : appt.shopName}
          </Text>
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
                      { text: "İptal Et", style: "destructive", onPress: onCancel },
                    ],
                  )
                }
              />
            )}
          </View>
        )}

        {/* Cancel for customer — only when >5h remain */}
        {role === "customer" && isActive && onCancel && canCancelCust && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() =>
              Alert.alert("İptal Et", "Bu randevuyu iptal etmek istiyor musunuz?", [
                { text: "Hayır", style: "cancel" },
                { text: "İptal Et", style: "destructive", onPress: onCancel },
              ])
            }
          >
            <Text style={styles.cancelText}>İptal Et</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
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
    <TouchableOpacity
      style={[styles.quickBtn, { backgroundColor: color + "20" }]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name={icon} size={14} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderRadius: colors.radius,
    marginHorizontal: 16,
    marginBottom: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  timeStrip: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 2,
  },
  time: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  timeSep: { fontSize: 10, color: "rgba(255,255,255,0.7)" },
  content: { flex: 1, padding: 12, gap: 4 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
  notes: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  quickBtn: { borderRadius: 8, padding: 6 },
  cancelBtn: { marginTop: 6, alignSelf: "flex-start" },
  cancelText: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.destructive },
});
