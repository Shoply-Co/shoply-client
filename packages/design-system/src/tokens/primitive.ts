export const primitive = {
  color: {
    white: "#FFFFFF",
    black: "#050507",
    neutral: {
      50: "#F7F8FA",
      100: "#EEF0F3",
      200: "#DEE2E7",
      300: "#C5CCD5",
      400: "#8F99A8",
      500: "#697385",
      600: "#4B5565",
      700: "#333B49",
      800: "#202631",
      900: "#111722",
      950: "#080B12"
    },
    brand: {
      50: "#F1F3FF",
      100: "#E2E6FF",
      200: "#C8D0FF",
      300: "#A9B2FF",
      400: "#858BFF",
      500: "#6266F1",
      600: "#4F46D9",
      700: "#4037B5",
      800: "#342F91",
      900: "#2E2B73"
    },
    mint: {
      100: "#DDFBEF",
      500: "#17B879",
      700: "#08764E"
    },
    coral: {
      100: "#FFE8E1",
      500: "#FF6F4E",
      700: "#B93E25"
    },
    rose: {
      100: "#FFE7EC",
      500: "#F35F78",
      700: "#A92C49"
    },
    amber: {
      100: "#FFF0C2",
      500: "#E6A400",
      700: "#8A5D00"
    },
    blue: {
      100: "#DDEEFF",
      500: "#2F80ED",
      700: "#1557A8"
    }
  },
  spacing: {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
    6: 12,
    7: 14,
    8: 16,
    10: 20,
    12: 24,
    16: 32,
    20: 40,
    24: 48
  },
  radius: {
    xs: 6,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
    sheet: 20,
    pill: 999
  },
  typography: {
    displaySm: { fontSize: 24, lineHeight: 34, fontWeight: "700" },
    titleLg: { fontSize: 20, lineHeight: 29, fontWeight: "700" },
    titleMd: { fontSize: 18, lineHeight: 26, fontWeight: "700" },
    bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
    bodyMd: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
    labelLg: { fontSize: 15, lineHeight: 21, fontWeight: "700" },
    labelMd: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
    caption: { fontSize: 12, lineHeight: 17, fontWeight: "500" }
  },
  shadow: {
    subtle: {
      shadowColor: "#111722",
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3
    },
    overlay: {
      shadowColor: "#050507",
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5
    }
  },
  motion: {
    quick: 120,
    normal: 180,
    slow: 260
  }
} as const;

export type PrimitiveTokens = typeof primitive;
