// Ambient module declarations for non-TS assets bundled by esbuild.
// The official Obsidian review scanner builds its own TS program from this
// tsconfig and cannot infer asset imports; declaring them structurally here
// keeps those imports string-typed instead of error-typed.

declare module '*.html' {
    const content: string;
    export default content;
}
