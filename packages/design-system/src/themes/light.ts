import { createComponentTokens } from "../tokens/component";
import { createSemanticTokens } from "../tokens/semantic";

const semantic = createSemanticTokens("light");

export const lightTheme = {
  semantic,
  component: createComponentTokens(semantic)
} as const;
