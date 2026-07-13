import { SemanticTokens } from "./semantic";

export const createComponentTokens = (semantic: SemanticTokens) =>
  ({
    button: {
      primary: {
        background: semantic.color.primary,
        pressedBackground: semantic.color.primaryPressed,
        text: semantic.color.textInverse,
        border: semantic.color.primary
      },
      secondary: {
        background: semantic.color.primarySoft,
        pressedBackground: semantic.color.surfaceMuted,
        text: semantic.color.primary,
        border: semantic.color.primarySoft
      },
      tertiary: {
        background: semantic.color.surfaceMuted,
        pressedBackground: semantic.color.border,
        text: semantic.color.text,
        border: semantic.color.surfaceMuted
      },
      ghost: {
        background: "rgba(5, 5, 7, 0.36)",
        pressedBackground: "rgba(5, 5, 7, 0.54)",
        text: semantic.color.textInverse,
        border: "rgba(255, 255, 255, 0.16)"
      },
      danger: {
        background: semantic.color.dangerFill,
        pressedBackground: semantic.color.danger,
        text: semantic.color.textInverse,
        border: semantic.color.dangerFill
      },
      text: {
        background: "transparent",
        pressedBackground: semantic.color.surfaceMuted,
        text: semantic.color.primary,
        border: "transparent"
      }
    },
    chip: {
      selectedBackground: semantic.color.primarySoft,
      selectedText: semantic.color.primary,
      selectedBorder: semantic.color.primary,
      background: semantic.color.surfaceMuted,
      text: semantic.color.text,
      border: semantic.color.border
    },
    input: {
      background: semantic.color.surfaceMuted,
      border: semantic.color.border,
      focusedBorder: semantic.color.primary,
      text: semantic.color.text,
      placeholder: semantic.color.textMuted
    },
    tabBar: {
      background: semantic.mode === "dark" ? "rgba(17, 23, 34, 0.84)" : "rgba(255, 255, 255, 0.88)",
      border: semantic.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 23, 34, 0.08)",
      active: semantic.color.primary,
      inactive: semantic.color.textMuted
    },
    sticker: {
      buttonBackground: "rgba(255, 255, 255, 0.94)",
      buttonText: "#111722",
      hotspot: semantic.color.primary,
      uploadedStroke: semantic.color.whiteStroke
    }
  }) as const;

export type ComponentTokens = ReturnType<typeof createComponentTokens>;
