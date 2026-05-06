import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, usePathname } from "expo-router";
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
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const isAuthScreen = AUTH_PATHS.some((p) => pathname === p || pathname.endsWith(p));

    if (!user && !isAuthScreen) {
      if (Platform.OS === "web") {
        (window as Window & typeof globalThis).location.href = "/login";
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, pathname]);

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
