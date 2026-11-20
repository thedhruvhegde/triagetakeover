/**
 * Side-effect entry for the Custom UI apps: bundled fonts (no CDN: the Forge CSP blocks remote
 * fonts) and the Takeover Triage palette. Import once from each app's `main.tsx`; tests skip it.
 * Inter and JetBrains Mono are SIL Open Font License 1.1 (via @fontsource), Latin subset only.
 */
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "./tt-theme.css";
