import { defineConfig } from "orval";

export default defineConfig({
  shoply: {
    input: {
      target: "../../../../docs/shoply-mvp1-openapi.yaml"
    },
    output: {
      mode: "single",
      target: "src/shared/api/generated/shoply.ts",
      client: "fetch",
      clean: true,
      override: {
        mutator: {
          path: "src/shared/api/orval-fetch.ts",
          name: "shoplyFetch"
        }
      }
    }
  }
});
