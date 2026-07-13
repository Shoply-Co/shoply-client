import { PropsWithChildren } from "react";
import { StyleSheet } from "react-native-unistyles";
import { darkTheme, lightTheme, ShoplyThemeProvider } from "@shoply/design-system";

let configured = false;

function configureUnistyles() {
  if (configured) return;
  configured = true;
  StyleSheet.configure({
    themes: {
      light: lightTheme,
      dark: darkTheme
    },
    settings: {
      adaptiveThemes: true
    }
  });
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  configureUnistyles();
  return <ShoplyThemeProvider>{children}</ShoplyThemeProvider>;
}
