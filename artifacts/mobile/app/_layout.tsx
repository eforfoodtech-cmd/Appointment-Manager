import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, usePathname, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl, useSeedWeekSlots } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const AUTH_PATHS = ["/login", "/register"];

function getHomePath(role?: "barber" | "customer" | null) {
  return role === "barber" ? "/(barber)" : "/(customer)";
}

function isCustomerOnlyPath(pathname: string) {
  return pathname.startsWith("/(customer)");
}

function isBarberOnlyPath(pathname: string) {
  return pathname.startsWith("/(barber)");
}

function BarberSeeder() {
  const { user, token } = useAuth();
  const seededRef = useRef(false);
  const seedWeek = useSeedWeekSlots();

  useEffect(() => {
    if (user?.role === "barber" && token && !seededRef.current) {
      seededRef.current = true;
      seedWeek.mutate(undefined, {
        onError: () => {},
      });
    }
  }, [user, token, seedWeek]);

  return null;
}

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const routeGroup = segments[0];
    const isAuthScreen = AUTH_PATHS.some((p) => pathname === p || pathname.endsWith(p));
    const homePath = getHomePath(user?.role ?? null);

    if (!user) {
      if (!isAuthScreen && pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    if (isAuthScreen || pathname === "/login") {
      if (pathname !== homePath) {
        router.replace(homePath);
      }
      return;
    }

    if (user.role === "barber" && routeGroup === "(customer)") {
      if (pathname !== homePath) {
        router.replace(homePath);
      }
      return;
    }

    if (user.role === "customer" && routeGroup === "(barber)") {
      if (pathname !== homePath) {
        router.replace(homePath);
      }
    }
  }, [user, isLoading, pathname, segments, router]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGuard />
      <BarberSeeder />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(barber)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen
          name="book/[barberId]"
          options={{ headerShown: true, title: "Randevu Al", headerBackTitle: "Geri" }}
        />
        <Stack.Screen
          name="appointment/[id]"
          options={{ headerShown: true, title: "Randevu Detayı", headerBackTitle: "Geri" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
