// 按官方社区审查配置(eslint-plugin-obsidianmd recommended, type-aware)扫描指定文件。
// 用法: node scripts/lint-scan.mjs [文件或目录...]  不带参数则扫描 src/**/*.ts
import { ESLint } from "eslint";
import { obsidianConfig } from "obsidian-plugin-validator/lib/eslint-config.mjs";

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["src/**/*.ts"];
const cfg = obsidianConfig({ typed: true, tsconfig: "./tsconfig.json" });
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: cfg, cwd: process.cwd() });
const results = await eslint.lintFiles(targets);
const byRule = {};
let total = 0;
for (const r of results) {
  const errs = r.messages.filter(m => m.severity === 2);
  if (errs.length) {
    for (const m of errs) {
      byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1;
      console.log(`${r.filePath.replace(process.cwd() + "/", "")}:${m.line}:${m.column}  ${m.ruleId}`);
    }
    total += errs.length;
  }
}
console.log("---- by rule ----");
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), rule);
console.log("TOTAL", total);
