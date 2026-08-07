export const palette = {
  dark: {
    canvas: "#121212",
    surface: "#191919",
    control: "#272727",
    seam: "#3d3d3d",
    text: "#f7f7f7",
    muted: "#a4a4a4",
    accent: "#3080ff",
    accentPressed: "#155dfc",
    success: "#9ae600",
    warning: "#fdc700",
    danger: "#ff637e",
  },
  light: {
    canvas: "#fbfbfb",
    surface: "#f3f3f3",
    control: "#e9e9e9",
    seam: "#d7d7d7",
    text: "#111111",
    muted: "#686868",
    accent: "#155dfc",
    accentPressed: "#1447e6",
    success: "#4d7c0f",
    warning: "#a16207",
    danger: "#e11d48",
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 18 } as const;
