'use client';

import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * Design tokens.
 *
 * Mantine supplies the component behaviour — focus management, portals, RTL,
 * keyboard handling — and everything visual is defined here rather than taken
 * from its defaults. That split is deliberate: the parts of a component library
 * worth depending on are the ones that are tedious and easy to get wrong, and
 * the part worth owning is the part users actually see.
 *
 * Palette notes:
 *  - The primary is a deep architectural blue, not the default indigo. It reads
 *    as drawing ink next to a plan, and it survives being printed.
 *  - Every colour is defined in OKLCH so the ten steps are perceptually even.
 *    In sRGB the mid steps of a hand-picked ramp drift in lightness, which is
 *    what makes a table of coloured trade chips look uneven for no visible
 *    reason.
 */

const ink: MantineColorsTuple = [
  'oklch(0.97 0.012 250)',
  'oklch(0.93 0.024 250)',
  'oklch(0.86 0.046 250)',
  'oklch(0.78 0.072 250)',
  'oklch(0.70 0.098 250)',
  'oklch(0.62 0.118 250)',
  'oklch(0.55 0.128 250)',
  'oklch(0.47 0.116 250)',
  'oklch(0.39 0.098 250)',
  'oklch(0.31 0.078 250)',
];

/** Used for anything the user must not misread: scale warnings, deleted rows. */
const alert: MantineColorsTuple = [
  'oklch(0.96 0.018 25)',
  'oklch(0.92 0.038 25)',
  'oklch(0.85 0.075 25)',
  'oklch(0.78 0.115 25)',
  'oklch(0.72 0.150 25)',
  'oklch(0.65 0.180 25)',
  'oklch(0.58 0.190 25)',
  'oklch(0.50 0.172 25)',
  'oklch(0.42 0.145 25)',
  'oklch(0.35 0.118 25)',
];

/** Confirmed, measured, approved. */
const verified: MantineColorsTuple = [
  'oklch(0.96 0.020 155)',
  'oklch(0.92 0.042 155)',
  'oklch(0.85 0.080 155)',
  'oklch(0.78 0.115 155)',
  'oklch(0.71 0.140 155)',
  'oklch(0.64 0.150 155)',
  'oklch(0.57 0.145 155)',
  'oklch(0.49 0.128 155)',
  'oklch(0.41 0.106 155)',
  'oklch(0.34 0.086 155)',
];

/** Needs a human: low confidence, unresolved scale, unapproved quantity. */
const caution: MantineColorsTuple = [
  'oklch(0.97 0.025 85)',
  'oklch(0.94 0.055 85)',
  'oklch(0.89 0.105 85)',
  'oklch(0.85 0.140 85)',
  'oklch(0.81 0.160 85)',
  'oklch(0.76 0.165 85)',
  'oklch(0.69 0.155 85)',
  'oklch(0.60 0.135 85)',
  'oklch(0.50 0.112 85)',
  'oklch(0.41 0.090 85)',
];

const slate: MantineColorsTuple = [
  'oklch(0.985 0.002 250)',
  'oklch(0.960 0.004 250)',
  'oklch(0.920 0.006 250)',
  'oklch(0.870 0.008 250)',
  'oklch(0.800 0.010 250)',
  'oklch(0.700 0.012 250)',
  'oklch(0.590 0.014 250)',
  'oklch(0.470 0.016 250)',
  'oklch(0.350 0.016 250)',
  'oklch(0.240 0.014 250)',
];

/**
 * Hebrew-first font stack.
 *
 * No web font is loaded. A Hebrew UI that waits on a font download shows a
 * flash of Latin fallback glyphs where Hebrew text should be, and the system
 * faces below — Segoe UI on Windows, San Francisco on macOS, Noto on Linux —
 * all have complete Hebrew coverage and correct RTL metrics.
 */
const FONT_STACK =
  '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans Hebrew", "Arial Hebrew", system-ui, sans-serif';

/** Tabular figures matter here: quantity columns must align digit for digit. */
const MONO_STACK = '"SF Mono", "Cascadia Mono", "Roboto Mono", ui-monospace, monospace';

export const theme = createTheme({
  primaryColor: 'ink',
  primaryShade: { light: 6, dark: 4 },
  colors: { ink, alert, verified, caution, slate },

  fontFamily: FONT_STACK,
  fontFamilyMonospace: MONO_STACK,
  headings: {
    fontFamily: FONT_STACK,
    fontWeight: '600',
    sizes: {
      h1: { fontSize: rem(28), lineHeight: '1.3' },
      h2: { fontSize: rem(22), lineHeight: '1.35' },
      h3: { fontSize: rem(18), lineHeight: '1.4' },
      h4: { fontSize: rem(16), lineHeight: '1.45' },
    },
  },

  defaultRadius: 'md',
  radius: { xs: rem(4), sm: rem(6), md: rem(8), lg: rem(12), xl: rem(16) },

  // A slightly tighter scale than Mantine's default. Dense tables are the point
  // of this product, and the stock spacing pushes a bill of quantities off the
  // fold.
  spacing: { xs: rem(6), sm: rem(10), md: rem(16), lg: rem(22), xl: rem(32) },

  shadows: {
    xs: '0 1px 2px oklch(0.3 0.02 250 / 0.06)',
    sm: '0 1px 3px oklch(0.3 0.02 250 / 0.08), 0 1px 2px oklch(0.3 0.02 250 / 0.04)',
    md: '0 4px 12px oklch(0.3 0.02 250 / 0.08), 0 1px 3px oklch(0.3 0.02 250 / 0.05)',
    lg: '0 12px 28px oklch(0.3 0.02 250 / 0.10), 0 2px 6px oklch(0.3 0.02 250 / 0.05)',
  },

  cursorType: 'pointer',
  focusRing: 'auto',

  components: {
    Card: {
      defaultProps: { withBorder: true, shadow: 'xs', radius: 'lg', padding: 'lg' },
    },
    Table: {
      defaultProps: { verticalSpacing: 'xs', horizontalSpacing: 'md', highlightOnHover: true },
    },
    Badge: {
      defaultProps: { radius: 'sm', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 } },
    },
    Button: {
      defaultProps: { radius: 'md' },
      styles: { root: { fontWeight: 600 } },
    },
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 2 } } },
    Tooltip: { defaultProps: { radius: 'sm', withArrow: true, openDelay: 300 } },
  },
});
