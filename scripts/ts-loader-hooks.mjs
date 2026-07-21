/**
 * Node module-customization hooks that transpile project TypeScript files on
 * the fly with the already-installed `typescript` package (pure JavaScript —
 * no esbuild, no native binaries, no child processes). This exists because
 * `tsx`'s native esbuild binary can fail with EPERM under restrictive Windows
 * group policy; `transpileModule` runs entirely in-process.
 *
 * Scope is deliberately narrow: only files that resolve inside this
 * repository (including pnpm-linked workspace packages such as @ok/domain,
 * whose real path is packages/domain) are transpiled. This is a runner for
 * project scripts like apps/web/scripts/seed.ts, not a general-purpose
 * runtime transpiler for third-party code.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_URL_PREFIX = pathToFileURL(REPO_ROOT + path.sep).href;

function isRelative(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** Resolve extensionless relative imports to their .ts source. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (isRelative(specifier) && (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "ERR_UNSUPPORTED_DIR_IMPORT")) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          /* try the next candidate */
        }
      }
    }
    throw error;
  }
}

/** Transpile in-repository .ts files to ESM in-process. */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") && url.startsWith("file:") && url.startsWith(ROOT_URL_PREFIX) && !url.includes("/node_modules/")) {
    const fileName = fileURLToPath(url);
    const source = await readFile(fileName, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        isolatedModules: true,
        sourceMap: false,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
