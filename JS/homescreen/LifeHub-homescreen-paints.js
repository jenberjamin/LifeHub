/* LifeHub — the Home Screen's paint colours (the clock and logo ink).
   ────────────────────────────────────────────────────────────────
   Its own file so Poppy's phone chat knows the same names the Home
   Screen does, and can change the TV's colour by name. Add a colour
   here and both pick it up.

   Load it BEFORE JS/homescreen/LifeHub-homescreen.js (and, on the phone
   page, before JS/poppy/PoppyEngine-navigate.js). */

window.LIFEHUB_PAINTS = [
  { name: "White",        ink: "#ffffff" },
  { name: "Cream",        ink: "#f4e9d2" },
  { name: "Black",        ink: "#12100e" },
  { name: "Light Brown",  ink: "#c99a6a" },
  { name: "Dark Brown",   ink: "#6f4b2e" },
  { name: "Cherry Red",   ink: "#e0384c" },
  { name: "Crimson",      ink: "#9c1b31" },
  { name: "Cyan",         ink: "#00e5ff" },
  { name: "Green",        ink: "#35c46a" },
  { name: "Gray",         ink: "#a7adb4" },
  { name: "Pastel Green", ink: "#aedcbf" },
  { name: "Evergreen",    ink: "#0d5c3d" },
  { name: "Moss Green",   ink: "#7d9455" }
];
