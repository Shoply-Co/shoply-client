import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { ColorSchemeName, useColorScheme } from "react-native";
import { darkTheme } from "./dark";
import { lightTheme } from "./light";

export type ShoplyTheme = typeof lightTheme;

const ThemeContext = createContext<ShoplyTheme>(lightTheme);

interface ThemeProviderProps extends PropsWithChildren {
  colorScheme?: ColorSchemeName;
}

export function ShoplyThemeProvider({ children, colorScheme }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolvedScheme = colorScheme ?? systemScheme;

  const value = useMemo(
    () => (resolvedScheme === "dark" ? darkTheme : lightTheme),
    [resolvedScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useShoplyTheme() {
  return useContext(ThemeContext);
}
