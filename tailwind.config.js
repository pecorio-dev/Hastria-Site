/** Tailwind pour la vitrine hastria.fun — mêmes jetons que le site d'origine. */
module.exports = {
  content: ["./index.html", "./app.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["'Space Grotesk'", "sans-serif"],
        serif: ["'Instrument Serif'", "serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      colors: {
        ink: "#07070B",
        paper: "#F4F1EA",
        violet2: "#7C6CFF",
        mint: "#00E8B8",
        amber2: "#FFB340"
      }
    }
  },
  plugins: []
};
