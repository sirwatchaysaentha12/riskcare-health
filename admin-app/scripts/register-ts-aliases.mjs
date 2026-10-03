import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import typescript from 'typescript'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath
    if (specifier.startsWith('@/')) {
      basePath = `${sourceRoot}${specifier.slice(2).replaceAll('/', '\\')}`
    } else if ((specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL?.startsWith('file:')
      && /\.tsx?$/.test(new URL(context.parentURL).pathname)) {
      basePath = fileURLToPath(new URL(specifier, context.parentURL))
    } else {
      return nextResolve(specifier, context)
    }
    const candidates = extname(basePath)
      ? [basePath]
      : [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.mjs`, `${basePath}\\index.ts`]
    const match = candidates.find(existsSync)
    return match ? nextResolve(pathToFileURL(match).href, context) : nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !/\.tsx?$/.test(new URL(url).pathname)) return nextLoad(url, context)
    const source = readFileSync(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      source: typescript.transpileModule(source, {
        compilerOptions: {
          module: typescript.ModuleKind.ESNext,
          target: typescript.ScriptTarget.ES2022,
          jsx: typescript.JsxEmit.ReactJSX,
        },
      }).outputText,
      shortCircuit: true,
    }
  },
})
