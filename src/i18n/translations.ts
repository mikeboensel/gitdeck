import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { zh } from "./zh";

export const translations = { en, it, fr, es, de, zh } as const;
export type TranslationKey = keyof typeof en;
