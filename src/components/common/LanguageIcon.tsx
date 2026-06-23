import type { IconType } from "react-icons";
import { LuFileQuestion } from "react-icons/lu";
import {
  SiC,
  SiCplusplus,
  SiCss,
  SiDart,
  SiGnubash,
  SiGo,
  SiHtml5,
  SiJavascript,
  SiJupyter,
  SiKotlin,
  SiLatex,
  SiOpenjdk,
  SiPhp,
  SiPython,
  SiRuby,
  SiRust,
  SiSharp,
  SiSwift,
  SiTypescript,
  SiVuedotjs,
} from "react-icons/si";
import { getLanguageColor } from "../../utils/colors";

// Brand logos for the common languages; long-tail languages fall back to the
// GitHub colored dot. Keys are lowercased language names.
const LANG_ICONS: Record<string, IconType> = {
  python: SiPython,
  typescript: SiTypescript,
  javascript: SiJavascript,
  html: SiHtml5,
  css: SiCss,
  "jupyter notebook": SiJupyter,
  java: SiOpenjdk,
  go: SiGo,
  rust: SiRust,
  ruby: SiRuby,
  swift: SiSwift,
  kotlin: SiKotlin,
  php: SiPhp,
  dart: SiDart,
  "c++": SiCplusplus,
  c: SiC,
  "c#": SiSharp,
  vue: SiVuedotjs,
  shell: SiGnubash,
  tex: SiLatex,
};

export function isUnknownLanguage(name: string): boolean {
  const key = name.trim().toLowerCase();
  return key === "" || key === "—" || key === "-" || key === "unknown" || key === "other";
}

export function LanguageIcon({ name, size = 14 }: { name: string; size?: number }) {
  // Repos with no detected language ("—") get an explicit "unknown" marker.
  if (isUnknownLanguage(name)) {
    return (
      <LuFileQuestion
        size={size}
        style={{ color: "var(--muted)", flexShrink: 0 }}
        aria-hidden="true"
      />
    );
  }
  const color = getLanguageColor(name);
  const Icon = LANG_ICONS[name.toLowerCase()];
  if (Icon) return <Icon size={size} color={color} style={{ flexShrink: 0 }} aria-hidden="true" />;
  // Fallback: the original colored dot.
  return (
    <span
      className="label-swatch"
      style={{ borderRadius: "50%", background: color, width: 10, height: 10, flexShrink: 0 }}
      aria-hidden="true"
    />
  );
}
