import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 全局忽略：构建产物与已有 .gitignore 项对齐
  {
    ignores: [
      'node_modules/',
      'main.js',
      '*.js.map',
      'data/',
      '.claude/',
      // 第三方 vendor 代码（js-mdict v6.0.8, MIT），刻意贴近上游，不适用本仓规则
      'src/core/mdx/vendor/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // —— 宽松 baseline：noisy 规则降为 warn，让首次 lint 返回 exit 0 ——
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 主入口 main-unified-full.ts 开头有 @ts-nocheck
      '@typescript-eslint/ban-ts-comment': 'warn',
      // 既有代码可能较多非空断言
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // esbuild 产物为 cjs，src 内若用 require 放行
      '@typescript-eslint/no-require-imports': 'off',

      // —— 既有代码批量触发的 recommended error 规则，降为 warn（首次先绿）——
      'no-useless-escape': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-misleading-character-class': 'warn',
      'no-var': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',

      // —— 关闭所有格式规则，不触碰既有缩进（tab vs 4-space 混用）——
      // flat config 默认不含 indent/semi/quotes，此处不主动开启。

      // no-unused-vars 交给 @typescript-eslint 版本，避免双重报错
      'no-unused-vars': 'off',
    },
  },
);
