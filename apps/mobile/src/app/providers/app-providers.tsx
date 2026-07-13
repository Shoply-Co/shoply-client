import { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppQueryProvider } from "./query-provider";
import { SessionProvider } from "./session-provider";
import { AppThemeProvider } from "./theme-provider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <AppQueryProvider>
            <SessionProvider>
              <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
            </SessionProvider>
          </AppQueryProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
