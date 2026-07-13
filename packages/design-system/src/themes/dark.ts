import { createComponentTokens } from "../tokens/component";
import { createSemanticTokens } from "../tokens/semantic";

const semantic = createSemanticTokens("dark");

export const darkTheme = {
  semantic,
  component: createComponentTokens(semantic)
} as const;
