import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default [
  // ESM build
  {
    input: "src/index.tsx",
    output: {
      file: "dist/index.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: [
      resolve({
        // This is crucial - it tells Rollup to bundle dependencies
        resolveOnly: [/^layercode-js-sdk/],
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "dist",
        outDir: "dist",
      }),
    ],
    // Mark both React and layercode-js-sdk as external
    external: ["react"],
  },
];
