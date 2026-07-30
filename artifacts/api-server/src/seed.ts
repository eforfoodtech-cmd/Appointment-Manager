import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { barbersTable, customersTable, db, usersTable } from "@workspace/db";

type DemoUser = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "barber" | "customer";
  phone: string;
  shopName?: string;
  shopAddress?: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "berber@example.com",
    password: "123456",
    firstName: "Demo",
    lastName: "Berber",
    role: "barber",
    phone: "5550000001",
    shopName: "Demo Berber Salonu",
    shopAddress: "Atatürk Mahallesi, Demo Caddesi No: 1, İstanbul",
  },
  {
    email: "musteri@example.com",
    password: "123456",
    firstName: "Demo",
    lastName: "Müşteri",
    role: "customer",
    phone: "5550000002",
  },
];

export async function seedDemoUsers(): Promise<void> {
  for (const demoUser of DEMO_USERS) {
    const legacyPhone = `0${demoUser.phone}`;
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.email, demoUser.email),
          eq(usersTable.phone, demoUser.phone),
          eq(usersTable.phone, legacyPhone),
          // Previous demo versions stored the phone number in the email field.
          eq(usersTable.email, demoUser.phone),
          eq(usersTable.email, legacyPhone),
        ),
      )
      .limit(1);

    if (existingUser) {
      await db
        .update(usersTable)
        .set({
          ...([demoUser.phone, legacyPhone].includes(existingUser.email)
            ? { email: demoUser.email }
            : {}),
          name: `${demoUser.firstName} ${demoUser.lastName}`,
          firstName: existingUser.firstName ?? demoUser.firstName,
          lastName: existingUser.lastName ?? demoUser.lastName,
          phone: demoUser.phone,
        })
        .where(eq(usersTable.id, existingUser.id));

      if (demoUser.role === "barber") {
        const [barber] = await db
          .select()
          .from(barbersTable)
          .where(eq(barbersTable.userId, existingUser.id))
          .limit(1);

        if (barber && !barber.shopAddress) {
          await db
            .update(barbersTable)
            .set({ shopAddress: demoUser.shopAddress })
            .where(eq(barbersTable.id, barber.id));
        }
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(demoUser.password, 10);

    await db.transaction(async (tx) => {
      const [insertedUser] = await tx
        .insert(usersTable)
        .values({
          email: demoUser.email,
          passwordHash,
          name: `${demoUser.firstName} ${demoUser.lastName}`,
          firstName: demoUser.firstName,
          lastName: demoUser.lastName,
          phone: demoUser.phone,
          role: demoUser.role,
        })
        .returning({ id: usersTable.id });

      if (demoUser.role === "barber") {
        await tx.insert(barbersTable).values({
          userId: insertedUser.id,
          shopName: demoUser.shopName ?? "Demo Berber Salonu",
          shopAddress: demoUser.shopAddress,
          isActive: true,
        });
      } else {
        await tx.insert(customersTable).values({ userId: insertedUser.id });
      }
    });
  }
}
