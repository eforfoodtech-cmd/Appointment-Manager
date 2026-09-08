import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetMyBarberProfile,
  useListAppointments,
  type Appointment,
} from "@workspace/api-client-react";

import { BarberAccessCard } from "@/components/BarberAccessCard";
import { CustomerDirectory } from "@/components/BusinessSettings";
import colors from "@/constants/colors";

const c = colors.light;
const ACTIVE_STATUSES = new Set<Appointment["status"]>([
  "pending",
  "confirmed",
]);

type CustomerSummary = {
  key: string;
  name: string;
  phone: string | null;
  isManual: boolean;
  appointmentCount: number;
  upcomingCount: number;
  nextAppointmentAt: number | null;
  latestAppointmentAt: number | null;
};

type MutableCustomerSummary = CustomerSummary;
type CustomerFilter = "all" | "upcoming" | "manual";
const CUSTOMER_PAGE_SIZE = 20;

function getAppointmentTimestamp(appointment: Appointment): number | null {
  const time =
    appointment.startTime.length === 5
      ? `${appointment.startTime}:00`
      : appointment.startTime;
  const timestamp = Date.parse(`${appointment.date}T${time}`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getCustomerKey(appointment: Appointment): string {
  if (appointment.customerId !== null && appointment.customerId !== undefined) {
    return `customer:${appointment.customerId}`;
  }

  const normalizedPhone = appointment.customerPhone?.replace(/\D/g, "") ?? "";
  if (normalizedPhone) return `manual-phone:${normalizedPhone}`;

  return `manual-name:${normalizePersonName(
    appointment.customerName,
  ).toLocaleLowerCase("tr-TR")}`;
}

function summarizeCustomers(
  appointments: Appointment[],
  now: number,
): CustomerSummary[] {
  const customerMap = new Map<string, MutableCustomerSummary>();

  for (const appointment of appointments) {
    const key = getCustomerKey(appointment);
    const appointmentAt = getAppointmentTimestamp(appointment);
    const isUpcoming =
      appointmentAt !== null &&
      appointmentAt >= now &&
      ACTIVE_STATUSES.has(appointment.status);
    const normalizedName =
      normalizePersonName(appointment.customerName) || "İsimsiz müşteri";
    const normalizedPhone = appointment.customerPhone?.trim() || null;
    const existing = customerMap.get(key);

    if (!existing) {
      customerMap.set(key, {
        key,
        name: normalizedName,
        phone: normalizedPhone,
        isManual: appointment.isManual || appointment.customerId == null,
        appointmentCount: 1,
        upcomingCount: isUpcoming ? 1 : 0,
        nextAppointmentAt: isUpcoming ? appointmentAt : null,
        latestAppointmentAt: appointmentAt,
      });
      continue;
    }

    existing.appointmentCount += 1;
    if (!existing.phone && normalizedPhone) existing.phone = normalizedPhone;

    if (isUpcoming && appointmentAt !== null) {
      existing.upcomingCount += 1;
      existing.nextAppointmentAt =
        existing.nextAppointmentAt === null
          ? appointmentAt
          : Math.min(existing.nextAppointmentAt, appointmentAt);
    }

    if (appointmentAt !== null) {
      existing.latestAppointmentAt =
        existing.latestAppointmentAt === null
          ? appointmentAt
          : Math.max(existing.latestAppointmentAt, appointmentAt);
    }
  }

  return Array.from(customerMap.values()).sort((first, second) => {
    if (first.nextAppointmentAt !== null && second.nextAppointmentAt !== null) {
      return first.nextAppointmentAt - second.nextAppointmentAt;
    }
    if (first.nextAppointmentAt !== null) return -1;
    if (second.nextAppointmentAt !== null) return 1;

    return (
      (second.latestAppointmentAt ?? Number.NEGATIVE_INFINITY) -
      (first.latestAppointmentAt ?? Number.NEGATIVE_INFINITY)
    );
  });
}

function formatAppointmentMoment(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BarberCustomersScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(CUSTOMER_PAGE_SIZE);
  const [showAccessCard, setShowAccessCard] = useState(false);
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);

  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    isRefetching: isProfileRefetching,
    refetch: refetchProfile,
  } = useGetMyBarberProfile();
  const {
    data: appointments,
    isLoading: areAppointmentsLoading,
    isError: areAppointmentsError,
    isRefetching: areAppointmentsRefetching,
    refetch: refetchAppointments,
  } = useListAppointments();

  // Appointment data keeps manual customers and next-appointment summaries;
  // persistent CRM notes are loaded only when their collapsed panel is opened.
  const customers = useMemo(
    () => summarizeCustomers(appointments ?? [], Date.now()),
    [appointments],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      if (filter === "upcoming" && customer.upcomingCount === 0) return false;
      if (filter === "manual" && !customer.isManual) return false;
      if (!normalizedSearch) return true;
      const searchableValue =
        `${customer.name} ${customer.phone ?? ""}`.toLocaleLowerCase("tr-TR");
      return searchableValue.includes(normalizedSearch);
    });
  }, [customers, filter, normalizedSearch]);

  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, visibleLimit),
    [filteredCustomers, visibleLimit],
  );

  useEffect(() => {
    setVisibleLimit(CUSTOMER_PAGE_SIZE);
  }, [filter, normalizedSearch]);

  const upcomingAppointmentCount = useMemo(
    () =>
      (appointments ?? []).filter((appointment) => {
        const appointmentAt = getAppointmentTimestamp(appointment);
        return (
          appointmentAt !== null &&
          appointmentAt >= Date.now() &&
          ACTIVE_STATUSES.has(appointment.status)
        );
      }).length,
    [appointments],
  );

  const handleRefresh = useCallback(() => {
    void Promise.all([refetchProfile(), refetchAppointments()]);
  }, [refetchAppointments, refetchProfile]);

  const isInitialLoading =
    (isProfileLoading && !profile) || (areAppointmentsLoading && !appointments);
  const hasBlockingError =
    (isProfileError && !profile) || (areAppointmentsError && !appointments);
  const isRefreshing = isProfileRefetching || areAppointmentsRefetching;
  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : 0);

  if (isInitialLoading) {
    return (
      <View style={[styles.stateScreen, { paddingTop }]}>
        <ActivityIndicator color={c.primary} size="large" />
        <Text style={styles.stateTitle}>Müşteriler hazırlanıyor</Text>
        <Text style={styles.stateDescription}>
          Profilin ve randevuların yükleniyor.
        </Text>
      </View>
    );
  }

  if (hasBlockingError || !profile) {
    return (
      <View style={[styles.stateScreen, { paddingTop }]}>
        <View style={styles.stateIcon}>
          <Feather name="alert-circle" size={25} color={c.destructive} />
        </View>
        <Text style={styles.stateTitle}>Bilgiler alınamadı</Text>
        <Text style={styles.stateDescription}>
          Bağlantını kontrol edip yeniden deneyebilirsin.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={handleRefresh}
          style={styles.retryButton}
        >
          {isRefreshing ? (
            <ActivityIndicator color={c.primaryForeground} size="small" />
          ) : (
            <>
              <Feather
                name="refresh-cw"
                size={16}
                color={c.primaryForeground}
              />
              <Text style={styles.retryButtonText}>Tekrar dene</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleCustomers}
        keyExtractor={(customer) => customer.key}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={c.primary}
            colors={[c.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop,
            paddingBottom: insets.bottom + 110,
            flexGrow: visibleCustomers.length === 0 ? 1 : undefined,
          },
        ]}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>MÜŞTERİ YÖNETİMİ</Text>
                <Text style={styles.title}>Müşteriler</Text>
              </View>
              <View style={styles.headerIcon}>
                <Feather name="users" size={20} color={c.primary} />
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: showAccessCard }}
              activeOpacity={0.78}
              onPress={() => setShowAccessCard((value) => !value)}
              style={styles.accessToggle}
            >
              <View style={styles.accessToggleIcon}>
                <Feather name="user-plus" size={18} color={c.primary} />
              </View>
              <View style={styles.accessToggleCopy}>
                <Text style={styles.accessToggleTitle}>Müşteri davet et</Text>
                <Text style={styles.accessToggleText}>
                  Berber kodunu veya QR kodunu paylaş
                </Text>
              </View>
              <Feather
                name={showAccessCard ? "chevron-up" : "chevron-down"}
                size={19}
                color={c.mutedForeground}
              />
            </TouchableOpacity>
            {showAccessCard ? (
              <BarberAccessCard
                barberId={profile.id}
                shopName={profile.shopName}
                style={styles.accessCard}
              />
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: showCustomerNotes }}
              activeOpacity={0.78}
              onPress={() => setShowCustomerNotes((value) => !value)}
              style={styles.accessToggle}
            >
              <View style={styles.accessToggleIcon}>
                <Feather name="tag" size={18} color={c.primary} />
              </View>
              <View style={styles.accessToggleCopy}>
                <Text style={styles.accessToggleTitle}>
                  Notlar ve etiketler
                </Text>
                <Text style={styles.accessToggleText}>
                  Müşterilere özel not ve etiket ekle
                </Text>
              </View>
              <Feather
                name={showCustomerNotes ? "chevron-up" : "chevron-down"}
                size={19}
                color={c.mutedForeground}
              />
            </TouchableOpacity>
            {showCustomerNotes ? <CustomerDirectory /> : null}

            <View style={styles.statsRow}>
              <SummaryCard
                icon="users"
                label="Toplam müşteri"
                value={customers.length}
                color={c.primary}
              />
              <SummaryCard
                icon="calendar"
                label="Yaklaşan randevu"
                value={upcomingAppointmentCount}
                color={c.accent}
              />
            </View>

            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color={c.mutedForeground} />
              <TextInput
                accessibilityLabel="Müşteri ara"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setSearch}
                placeholder="Ad veya telefon ile ara"
                placeholderTextColor={c.mutedForeground}
                returnKeyType="search"
                style={styles.searchInput}
                value={search}
              />
              {search.length > 0 ? (
                <TouchableOpacity
                  accessibilityLabel="Aramayı temizle"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setSearch("")}
                >
                  <Feather name="x" size={18} color={c.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.filterRow}>
              {(
                [
                  ["all", "Tümü", customers.length],
                  [
                    "upcoming",
                    "Yaklaşan",
                    customers.filter((item) => item.upcomingCount > 0).length,
                  ],
                  [
                    "manual",
                    "Manuel",
                    customers.filter((item) => item.isManual).length,
                  ],
                ] as Array<[CustomerFilter, string, number]>
              ).map(([id, label, count]) => (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.78}
                  onPress={() => setFilter(id)}
                  style={[
                    styles.filterButton,
                    filter === id && styles.filterButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filter === id && styles.filterTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.filterCount,
                      filter === id && styles.filterCountActive,
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Müşteri listesi</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {filteredCustomers.length}
                </Text>
              </View>
            </View>
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather
                name={normalizedSearch ? "search" : "user-plus"}
                size={28}
                color={c.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {normalizedSearch ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
            </Text>
            <Text style={styles.emptyDescription}>
              {normalizedSearch
                ? "Farklı bir ad veya telefon numarası deneyebilirsin."
                : "İlk randevu oluşturulduğunda müşteri burada görünecek. Manuel randevular da listeye eklenir."}
            </Text>
          </View>
        }
        ListFooterComponent={
          visibleCustomers.length < filteredCustomers.length ? (
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={() =>
                setVisibleLimit((value) => value + CUSTOMER_PAGE_SIZE)
              }
              style={styles.loadMoreButton}
            >
              <Text style={styles.loadMoreText}>Daha fazla müşteri göster</Text>
              <Text style={styles.loadMoreCount}>
                {filteredCustomers.length - visibleCustomers.length} kaldı
              </Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => <CustomerCard customer={item} />}
      />
    </View>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.summaryCard, { borderTopColor: color }]}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}16` }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}

function CustomerCard({ customer }: { customer: CustomerSummary }) {
  const initial = customer.name.charAt(0).toLocaleUpperCase("tr-TR") || "M";
  const appointmentLabel =
    customer.appointmentCount === 1
      ? "1 randevu"
      : `${customer.appointmentCount} randevu`;

  return (
    <View style={styles.customerCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      <View style={styles.customerCopy}>
        <View style={styles.customerNameRow}>
          <Text numberOfLines={1} style={styles.customerName}>
            {customer.name}
          </Text>
          {customer.isManual ? (
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>Manuel</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.detailRow}>
          <Feather
            name={customer.phone ? "phone" : "phone-off"}
            size={13}
            color={c.mutedForeground}
          />
          <Text style={styles.detailText}>
            {customer.phone || "Telefon bilgisi yok"}
          </Text>
        </View>

        <View style={styles.appointmentMeta}>
          <Text style={styles.appointmentCount}>{appointmentLabel}</Text>
          {customer.nextAppointmentAt !== null ? (
            <Text style={styles.nextAppointment}>
              Sıradaki: {formatAppointmentMoment(customer.nextAppointmentAt)}
            </Text>
          ) : (
            <Text style={styles.noUpcoming}>Yaklaşan randevu yok</Text>
          )}
        </View>
      </View>

      {customer.upcomingCount > 0 ? (
        <View style={styles.upcomingBadge}>
          <Text style={styles.upcomingBadgeValue}>
            {customer.upcomingCount}
          </Text>
          <Feather name="calendar" size={12} color={c.success} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    marginBottom: 16,
  },
  eyebrow: {
    color: c.accent,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  title: {
    color: c.foreground,
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  accessToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: c.card,
  },
  accessToggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
  },
  accessToggleCopy: { flex: 1, minWidth: 0 },
  accessToggleTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: c.foreground,
  },
  accessToggleText: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  accessCard: {
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    borderTopWidth: 3,
    padding: 12,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 21,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
  },
  summaryLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
  },
  searchContainer: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.input,
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: c.foreground,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  filterRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 18,
  },
  filterButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 9,
    backgroundColor: c.card,
  },
  filterButtonActive: { borderColor: c.primary, backgroundColor: c.primary },
  filterText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.mutedForeground,
  },
  filterTextActive: { color: "#fff" },
  filterCount: {
    minWidth: 17,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  filterCountActive: { color: "rgba(255,255,255,0.8)" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  countBadgeText: {
    color: c.primary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  loadMoreButton: {
    alignItems: "center",
    gap: 3,
    marginTop: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    backgroundColor: c.card,
  },
  loadMoreText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: c.primary,
  },
  loadMoreCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: c.mutedForeground,
  },
  separator: {
    height: 10,
  },
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  avatarText: {
    color: c.primary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  customerCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  customerName: {
    flexShrink: 1,
    color: c.foreground,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  manualBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#7C3AED14",
  },
  manualBadgeText: {
    color: "#6D28D9",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  detailText: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  appointmentMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 7,
  },
  appointmentCount: {
    color: c.primary,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  nextAppointment: {
    color: c.success,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  noUpcoming: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  upcomingBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: `${c.success}12`,
  },
  upcomingBadgeValue: {
    color: c.success,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 52,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 14,
  },
  emptyTitle: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyDescription: {
    color: c.mutedForeground,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 6,
  },
  stateScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 80,
    backgroundColor: c.background,
  },
  stateIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${c.destructive}12`,
    marginBottom: 14,
  },
  stateTitle: {
    color: c.foreground,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginTop: 14,
  },
  stateDescription: {
    color: c.mutedForeground,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 5,
  },
  retryButton: {
    minWidth: 140,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: colors.radius,
    backgroundColor: c.primary,
    paddingHorizontal: 18,
    marginTop: 18,
  },
  retryButtonText: {
    color: c.primaryForeground,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
