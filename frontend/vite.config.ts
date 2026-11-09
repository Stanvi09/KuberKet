import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Count the automatic tests (Python `def test_` + frontend `it(`/`test(`) so the story page never overstates them. */
function countTests(): number {
  const count = (dir: string, match: (name: string) => boolean, pattern: RegExp): number => {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) total += entry.name === "node_modules" ? 0 : count(path, match, pattern);
      else if (match(entry.name)) total += (readFileSync(path, "utf8").match(pattern) ?? []).length;
    }
    return total;
  };
  try {
    const python = count(join(__dirname, "..", "tests"), (n) => n.startsWith("test_") && n.endsWith(".py"), /^\s*def test_/gm);
    const frontend = count(join(__dirname, "src"), (n) => /\.test\.tsx?$/.test(n), /^\s*(it|test)\(/gm);
    return python + frontend;
  } catch {
    return 0;
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __TEST_COUNT__: JSON.stringify(countTests()) },
  server: {
    strictPort: true,
  },
});
