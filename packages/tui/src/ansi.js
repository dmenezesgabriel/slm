/** ANSI / CSI escape-code helpers — no external deps. */

const ESC = "\x1b";
const CSI = `${ESC}[`;

export const cursor = {
  to:      (r, c)  => `${CSI}${r};${c}H`,
  up:      (n = 1) => `${CSI}${n}A`,
  down:    (n = 1) => `${CSI}${n}B`,
  forward: (n = 1) => `${CSI}${n}C`,
  back:    (n = 1) => `${CSI}${n}D`,
  save:              `${CSI}s`,
  restore:           `${CSI}u`,
  hide:              `${CSI}?25l`,
  show:              `${CSI}?25h`,
};

export const erase = {
  screen:    `${CSI}2J`,
  down:      `${CSI}J`,
  line:      `${CSI}2K`,
  lineEnd:   `${CSI}K`,
  lineStart: `${CSI}1K`,
};

// CSI 2026 — Synchronized Output: terminal buffers all writes until `end`,
// then paints them atomically, eliminating flicker.
export const sync = {
  begin: `${CSI}?2026h`,
  end:   `${CSI}?2026l`,
};

// Bracketed Paste Mode — wraps pastes in start/end markers so the app can
// distinguish typed characters from pasted text.
export const paste = {
  enable:  `${CSI}?2004h`,
  disable: `${CSI}?2004l`,
  start:   `${ESC}[200~`,
  end:     `${ESC}[201~`,
};

export const style = {
  reset:     `${CSI}0m`,
  bold:      `${CSI}1m`,
  dim:       `${CSI}2m`,
  italic:    `${CSI}3m`,
  underline: `${CSI}4m`,
  blink:     `${CSI}5m`,
  inverse:   `${CSI}7m`,
  strike:    `${CSI}9m`,
};

export const color = {
  fg:  (n)          => `${CSI}38;5;${n}m`,
  bg:  (n)          => `${CSI}48;5;${n}m`,
  fgRgb: (r, g, b) => `${CSI}38;2;${r};${g};${b}m`,
  bgRgb: (r, g, b) => `${CSI}48;2;${r};${g};${b}m`,

  // Standard 8 + bright (foreground)
  black:         `${CSI}30m`,
  red:           `${CSI}31m`,
  green:         `${CSI}32m`,
  yellow:        `${CSI}33m`,
  blue:          `${CSI}34m`,
  magenta:       `${CSI}35m`,
  cyan:          `${CSI}36m`,
  white:         `${CSI}37m`,
  gray:          `${CSI}90m`,
  brightRed:     `${CSI}91m`,
  brightGreen:   `${CSI}92m`,
  brightYellow:  `${CSI}93m`,
  brightBlue:    `${CSI}94m`,
  brightMagenta: `${CSI}95m`,
  brightCyan:    `${CSI}96m`,
  brightWhite:   `${CSI}97m`,

  reset: `${CSI}0m`,
};
