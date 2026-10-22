// Builds each card as one self-contained HTML file (no network inside cards, §10).
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

for (const name of ["story", "today", "who", "trend", "photo", "lane"]) {
  await build({
    root: "src", logLevel: "warn", plugins: [viteSingleFile()],
    build: { outDir: "../dist", emptyOutDir: false, rollupOptions: { input: `src/${name}-card.html` } },
  });
  console.log(`built ${name}-card.html`);
}
