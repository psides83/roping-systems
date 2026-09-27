import type { CSSProperties } from "react";

export const defaultBranding = {
  primary: "#17251F",
  accent: "#BB3E24",
};

export const brandingPresets = [
  { name: "Arena", primary: "#17251F", accent: "#BB3E24" },
  { name: "Navy & gold", primary: "#17324D", accent: "#B7791F" },
  { name: "Charcoal & red", primary: "#292929", accent: "#B42318" },
  { name: "Burgundy & steel", primary: "#5A1F2B", accent: "#315C70" },
];

type BrandingProperties = CSSProperties & Record<`--brand-${string}`, string>;

function readableForeground(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((channel) => Number.parseInt(channel, 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.38 ? "#17201C" : "#FFFFFF";
}

export function getBrandStyle(primary = defaultBranding.primary, accent = defaultBranding.accent): BrandingProperties {
  return {
    "--brand-primary": primary,
    "--brand-primary-foreground": readableForeground(primary),
    "--brand-accent": accent,
    "--brand-accent-foreground": readableForeground(accent),
  };
}
