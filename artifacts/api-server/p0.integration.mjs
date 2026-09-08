import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { createRequire } from "node:module";
const requireDb = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { Client } = requireDb("pg");
requireDb("dotenv").config({
  path: new URL("./.env", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
  quiet: true,
});
const base = process.env.P0_TEST_URL || "http://127.0.0.1:8083/api";
const fixture = `p0-${randomUUID()}`;
const users = [];
let checks = 0;
async function api(path, method = "GET", body, token, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  checks++;
  return data;
}
async function register(role, suffix) {
  const email = `${fixture}-${suffix}@example.com`;
  const phone = "5" + String(randomInt(100000000, 999999999));
  const result = await api(
    "/auth/register",
    "POST",
    {
      role,
      email,
      password: "test-password-42",
      phone,
      firstName: "P0",
      lastName: "Test",
      authorizedFirstName: "P0",
      authorizedLastName: "Test",
      businessName: fixture,
      address: "Integration fixture",
    },
    undefined,
    201,
  );
  users.push(result.user.id);
  return { ...result, email, phone };
}
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const b = await register("barber", "b");
  const accessAtRegistration = await db.query(
    `SELECT ba.code
       FROM barber_access ba
       JOIN barbers b ON b.id = ba.barber_id
      WHERE b.user_id = $1`,
    [b.user.id],
  );
  assert.match(accessAtRegistration.rows[0]?.code, /^\d{6}$/);
  const other = await register("barber", "other");
  const c = await register("customer", "c");
  const duplicate = await api(
    "/auth/register",
    "POST",
    {
      role: "customer",
      email: c.email,
      phone: c.phone,
      password: "test-password-42",
      firstName: "P0",
      lastName: "Test",
    },
    undefined,
    409,
  );
  assert.equal(duplicate.code, "ACCOUNT_CONFLICT");
  assert.deepEqual(duplicate.fields.sort(), ["email", "phone"]);
  const bProfile = await api("/barbers/me", "GET", null, b.token);
  const otherProfile = await api("/barbers/me", "GET", null, other.token);
  await api("/barbers/me/customers", "GET", null, c.token, 403);
  const access = await api("/barbers/me/access", "GET", null, b.token);
  assert.match(access.code, /^\d{6}$/);
  assert.equal(
    (await api("/barbers/me/access", "GET", null, b.token)).code,
    access.code,
  );
  await api(
    "/customers/me/barbers/join",
    "POST",
    { code: access.code },
    c.token,
  );
  await api(
    "/customers/me/barbers/join",
    "POST",
    { code: access.code },
    c.token,
  );
  assert.equal(
    (await api("/customers/me/barbers", "GET", null, c.token)).length,
    1,
  );
  const contacts = await api("/barbers/me/customers", "GET", null, b.token);
  assert.equal(contacts.length, 1);
  await api(
    `/barbers/me/customers/${contacts[0].id}`,
    "PATCH",
    { privateNotes: "private fixture", tags: "test" },
    b.token,
  );
  await api(
    `/barbers/me/customers/${contacts[0].id}`,
    "PATCH",
    { privateNotes: "intrusion", tags: "" },
    other.token,
    404,
  );
  const service = await api(
    "/barbers/me/services",
    "POST",
    { name: "Saç", priceKurus: 25000, durationMinutes: 30, bufferMinutes: 5 },
    b.token,
    201,
  );
  await api(
    "/barbers/me/services",
    "POST",
    { name: "Invalid", priceKurus: -1, durationMinutes: 0 },
    b.token,
    400,
  );
  const slot = (token, startTime, endTime) =>
    api(
      "/barbers/me/slots",
      "POST",
      { date: "2099-01-12", startTime, endTime },
      token,
      201,
    );
  const s1 = await slot(b.token, "09:00", "10:00");
  const s2 = await slot(b.token, "11:00", "12:00");
  const small = await slot(b.token, "12:00", "12:30");
  const foreign = await slot(other.token, "09:00", "10:00");
  await api("/appointments", "POST", { slotId: s1.id }, c.token, 400);
  await api(
    "/appointments",
    "POST",
    { slotId: small.id, serviceId: service.id },
    c.token,
    400,
  );
  const appt = await api(
    "/appointments",
    "POST",
    { slotId: s1.id, serviceId: service.id },
    c.token,
    201,
  );
  assert.equal(appt.priceKurus, 25000);
  await api(
    `/barbers/me/services/${service.id}`,
    "PATCH",
    {
      name: "Saç yeni",
      priceKurus: 35000,
      durationMinutes: 30,
      bufferMinutes: 5,
    },
    b.token,
  );
  assert.equal(
    (await api(`/appointments/${appt.id}`, "GET", null, c.token)).priceKurus,
    25000,
  );
  assert.equal(
    (await api(`/barbers/${bProfile.id}/slots?date=2099-01-12`)).find(
      (x) => x.id === s1.id,
    ).appointment,
    null,
  );
  assert.ok(
    (
      await api(
        `/barbers/${bProfile.id}/slots?date=2099-01-12`,
        "GET",
        null,
        b.token,
      )
    ).find((x) => x.id === s1.id).appointment,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { slotId: foreign.id },
    c.token,
    400,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { status: "completed" },
    c.token,
    403,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { slotId: s2.id },
    other.token,
    403,
  );
  await api(
    "/barbers/me/exceptions",
    "POST",
    { date: "2099-01-12", startTime: "09:00", endTime: "10:00" },
    b.token,
    409,
  );
  await api(
    "/barbers/me/exceptions",
    "POST",
    { date: "2099-01-11", endDate: "2099-01-12" },
    b.token,
    409,
  );
  assert.equal(
    (await api("/barbers/me/exceptions", "GET", null, b.token)).length,
    0,
  );
  await api(
    "/barbers/me/exceptions",
    "POST",
    { date: "2099-01-15", endDate: "2099-01-17", reason: "Üç günlük izin" },
    b.token,
    201,
  );
  assert.equal(
    (await api("/barbers/me/exceptions", "GET", null, b.token)).length,
    3,
  );
  const closed = await api(
    "/barbers/me/exceptions",
    "POST",
    {
      date: "2099-01-12",
      startTime: "11:00",
      endTime: "12:00",
      reason: "İzin",
    },
    b.token,
    201,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { slotId: s2.id },
    c.token,
    409,
  );
  assert.equal(
    (await api(`/barbers/${bProfile.id}/slots?date=2099-01-12`)).find(
      (x) => x.id === s2.id,
    ).isAvailable,
    false,
  );
  await api(
    `/barbers/me/exceptions/${closed.id}`,
    "DELETE",
    null,
    b.token,
    204,
  );
  const moved = await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { slotId: s2.id },
    c.token,
  );
  assert.equal(moved.slotId, s2.id);
  const reminders = await db.query(
    "SELECT status, count(*)::int AS count FROM scheduled_notifications WHERE appointment_id=$1 AND type IN ('reminder_1d','reminder_1h') GROUP BY status",
    [appt.id],
  );
  assert.equal(reminders.rows.find((x) => x.status === "pending").count, 2);
  assert.equal(reminders.rows.find((x) => x.status === "cancelled").count, 2);
  const notifications = await api("/notifications", "GET", null, c.token);
  assert.equal(notifications.length, 2);
  await api(
    `/notifications/${notifications[0].id}/read`,
    "PATCH",
    null,
    c.token,
  );
  assert.ok((await api("/notifications", "GET", null, c.token))[0].readAt);
  await api("/account", "GET", null, c.token);
  await api(
    "/account",
    "PATCH",
    {
      name: "Updated",
      email: c.email,
      phone: c.user.phone,
      currentPassword: "wrong",
    },
    c.token,
    403,
  );
  await api(
    "/account",
    "PATCH",
    {
      name: "Updated",
      email: c.email,
      phone: c.user.phone,
      currentPassword: "test-password-42",
    },
    c.token,
  );
  await api(
    "/account/media",
    "PUT",
    { avatar: "https://invalid", gallery: [] },
    c.token,
    400,
  );
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=";
  await api(
    "/account/media",
    "PUT",
    { avatar: pixel, gallery: [pixel] },
    b.token,
  );
  assert.equal((await api(`/barbers/${bProfile.id}/media`)).avatar, pixel);
  await api(
    "/account/verification",
    "POST",
    { channel: "invalid" },
    c.token,
    400,
  );
  const sessions = await api("/account/sessions", "GET", null, c.token);
  assert.ok(sessions.some((x) => x.current));
  const second = await api("/auth/login", "POST", {
    identifier: c.email,
    password: "test-password-42",
  });
  await api("/account", "GET", null, second.token);
  const both = await api("/account/sessions", "GET", null, c.token);
  assert.equal(both.length, 2);
  await api(
    `/account/sessions/${both.find((x) => !x.current).id}`,
    "DELETE",
    null,
    c.token,
  );
  await api("/account", "GET", null, second.token, 401);
  await api(
    "/account",
    "DELETE",
    { currentPassword: "test-password-42", confirmation: "HESABIMI SİL" },
    c.token,
    409,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { status: "cancelled" },
    c.token,
  );
  await api(
    `/appointments/${appt.id}`,
    "PATCH",
    { slotId: s1.id },
    c.token,
    409,
  );
  await api(`/barbers/me/services/${service.id}`, "DELETE", null, b.token, 204);
  assert.equal((await api(`/barbers/${bProfile.id}/services`)).length, 0);
  await api(
    "/account/password",
    "POST",
    { currentPassword: "test-password-42", newPassword: "new-password-42" },
    c.token,
  );
  await api("/account", "GET", null, c.token, 401);
  const renewed = await api("/auth/login", "POST", {
    identifier: c.email,
    password: "new-password-42",
  });
  await api(
    "/account",
    "DELETE",
    { currentPassword: "new-password-42", confirmation: "HESABIMI SİL" },
    renewed.token,
  );
  await api("/account", "GET", null, renewed.token, 401);
  console.log(
    `PASS: ${checks} API checks plus persistence, ownership, reminder and session assertions.`,
  );
} finally {
  // Only IDs returned by this run's unique fixture registrations are removed.
  if (users.length) {
    await db.query("BEGIN");
    try {
      for (const table of [
        "scheduled_notifications",
        "user_notifications",
        "push_tokens",
        "contact_verifications",
        "password_resets",
        "account_settings",
        "user_sessions",
      ])
        await db.query(`DELETE FROM ${table} WHERE user_id = ANY($1::int[])`, [
          users,
        ]);
      await db.query(
        "DELETE FROM messages WHERE sender_id=ANY($1::int[]) OR receiver_id=ANY($1::int[])",
        [users],
      );
      for (const table of [
        "appointments",
        "barber_customers",
        "no_show_blocks",
        "services",
        "calendar_exceptions",
        "barber_access",
        "appointment_slots",
        "availability",
      ])
        await db.query(
          `DELETE FROM ${table} WHERE barber_id IN (SELECT id FROM barbers WHERE user_id=ANY($1::int[]))`,
          [users],
        );
      await db.query("DELETE FROM barbers WHERE user_id=ANY($1::int[])", [
        users,
      ]);
      await db.query("DELETE FROM customers WHERE user_id=ANY($1::int[])", [
        users,
      ]);
      await db.query("DELETE FROM users WHERE id=ANY($1::int[])", [users]);
      await db.query("COMMIT");
      console.log("Test fixtures removed; existing user data preserved.");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
  await db.end();
}
