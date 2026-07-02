import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable, barbersTable, customersTable } from "@workspace/db";

type DemoUser = {
  email: string;
  password: string;
  name: string;
  role: "barber" | "customer";
  phone: string;
  shopName?: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "05550000001",
    password: "123456",
    name: "Demo Berber",
    role: "barber",
    phone: "05550000001",
    shopName: "Demo Berber Salonu",
  },
  {
    email: "05550000002",
    password: "123456",
    name: "Demo Müşteri",
    role: "customer",
    phone: "05550000002",
  },
];

export async function seedDemoUsers(): Promise<void> {
  for (const demoUser of DEMO_USERS) {
    const [existingUser] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, demoUser.email))
      .limit(1);

    if (existingUser) {
      continue;
    }

    const passwordHash = await bcrypt.hash(demoUser.password, 10);

    await db.transaction(async (tx) => {
      const [insertedUser] = await tx
        .insert(usersTable)
        .values({
          email: demoUser.email,
          passwordHash,
          name: demoUser.name,
          phone: demoUser.phone,
          role: demoUser.role,
        })
        .returning({ id: usersTable.id });

      if (demoUser.role === "barber") {
        await tx.insert(barbersTable).values({
          userId: insertedUser.id,
          shopName: demoUser.shopName ?? "Demo Berber Salonu",
          isActive: true,
        });
      } else {
        await tx.insert(customersTable).values({ userId: insertedUser.id });
      }
    });
  }
}