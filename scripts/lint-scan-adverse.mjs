// 对抗性扫描:模拟官方扫描环境(更弱的类型解析,无 DOM lib),暴露跨包/环境依赖的类型问题。
// 用法: node scripts/lint-scan-adverse.mjs [files...]
import { ESLint } from "eslint";
import { obsidianConfig } from "obsidian-plugin-validator/lib/eslint-config.mjs";
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["src/**/*.ts"];
const cfg = obsidianConfig({ typed: true, tsconfig: "./tsconfig.adverse.json" });
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: cfg, cwd: process.cwd() });
const results = await eslint.lintFiles(targets);
const byRule = {};
let total = 0;
for (const r of results) for (const m of r.messages) {
  byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1; total++;
  console.log(`${r.filePath.replace(process.cwd() + "/", "")}:${m.line}:${m.column}  ${m.ruleId}`);
}
console.log("---- by rule ----");
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), rule);
console.log("TOTAL", total);
