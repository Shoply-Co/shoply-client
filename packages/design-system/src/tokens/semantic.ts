import { primitive } from "./primitive";

export const createSemanticTokens = (mode: "light" | "dark") => {
  const isDark = mode === "dark";

  return {
    mode,
    color: {
      background: isDark ? primitive.color.neutral[950] : primitive.color.white,
      surface: isDark ? primitive.color.neutral[900] : primitive.color.white,
      surfaceMuted: isDark ? primitive.color.neutral[800] : primitive.color.neutral[50],
      surfaceElevated: isDark ? primitive.color.neutral[800] : primitive.color.white,
      text: isDark ? primitive.color.neutral[50] : primitive.color.neutral[950],
      textMuted: isDark ? primitive.color.neutral[300] : primitive.color.neutral[500],
      textInverse: primitive.color.white,
      border: isDark ? primitive.color.neutral[700] : primitive.color.neutral[200],
      borderStrong: isDark ? primitive.color.neutral[600] : primitive.color.neutral[300],
      primary: primitive.color.brand[500],
      primaryPressed: primitive.color.brand[600],
      primarySoft: isDark ? "rgba(98, 102, 241, 0.18)" : primitive.color.brand[50],
      success: isDark ? primitive.color.mint[100] : primitive.color.mint[700],
      successFill: primitive.color.mint[500],
      warning: isDark ? primitive.color.amber[100] : primitive.color.amber[700],
      warningFill: primitive.color.amber[500],
      danger: isDark ? primitive.color.coral[100] : primitive.color.coral[700],
      dangerFill: primitive.color.coral[500],
      reactionFill: primitive.color.rose[500],
      info: isDark ? primitive.color.blue[100] : primitive.color.blue[700],
      infoFill: primitive.color.blue[500],
      mediaScrim: "rgba(5, 5, 7, 0.42)",
      mediaScrimStrong: "rgba(5, 5, 7, 0.64)",
      whiteStroke: "rgba(255, 255, 255, 0.94)"
    },
    spacing: primitive.spacing,
    radius: primitive.radius,
    typography: primitive.typography,
    shadow: primitive.shadow,
    motion: primitive.motion
  } as const;
};

export type SemanticTokens = ReturnType<typeof createSemanticTokens>;
