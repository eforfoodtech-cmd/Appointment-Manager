import React, { useState } from "react";
import { View, Text } from "react-native";
import {
  useGetBarberSlots,
  updateAppointment,
  getGetBarberSlotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Action, Field, businessStyles as s } from "./BusinessSettings";

export function RescheduleAppointment({
  id,
  barberId,
  initialDate,
}: {
  id: number;
  barberId: number;
  initialDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const query = useGetBarberSlots(
    barberId,
    { date },
    {
      query: {
        queryKey: getGetBarberSlotsQueryKey(barberId, { date }),
        enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(date),
      },
    },
  );
  return (
    <View style={s.card}>
      <Action
        title={open ? "Saat seçimini kapat" : "Randevu saatini değiştir"}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Field
            label="Yeni tarih (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
          />
          <Text style={s.text}>
            Müşteriler randevuya 5 saat kalana kadar değişiklik yapabilir.
          </Text>
          {query.isError ? (
            <Text style={s.error}>Saatler alınamadı.</Text>
          ) : null}
          {query.data
            ?.filter(
              (slot) =>
                slot.isAvailable &&
                !slot.isBooked &&
                new Date(`${date}T${slot.startTime}:00+03:00`).getTime() >
                  Date.now(),
            )
            .map((slot) => (
              <Action
                key={slot.id}
                disabled={busy}
                title={`${slot.startTime}–${slot.endTime} saatine taşı`}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await updateAppointment(id, { slotId: slot.id });
                    await client.invalidateQueries();
                    setOpen(false);
                  } catch (e: any) {
                    setError(e?.data?.error || "Randevu taşınamadı.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
