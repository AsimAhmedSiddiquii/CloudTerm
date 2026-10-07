import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function xtermFrozenPrototypeCompat(): Plugin {
  const xtermModule = '/@xterm/xterm/lib/xterm.mjs'
  const unsafeAssignment = 'o.toString=s'
  const safeAssignment = 'Object.defineProperty(o,"toString",{value:s,writable:true,configurable:true})'

  return {
    name: 'xterm-frozen-prototype-compat',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').includes(xtermModule)) return null

      if (!code.includes(unsafeAssignment)) {
        throw new Error('The xterm frozen-prototype compatibility patch no longer matches the installed xterm version.')
      }

      return {
        code: code.replace(unsafeAssignment, safeAssignment),
        map: null,
      }
    },
  }
}

function xtermStyleNonceCompat(): Plugin {
  const xtermModule = '/@xterm/xterm/lib/xterm.mjs'
  const styleCreation = /((?:this|[\w$]+)\.(?:_document|mainDocument))\.createElement\("style"\)/g

  return {
    name: 'xterm-style-nonce-compat',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').includes(xtermModule)) return null

      const styles = [...code.matchAll(styleCreation)]
      if (styles.length !== 3) {
        throw new Error('The xterm style-nonce compatibility patch no longer matches the installed xterm version.')
      }

      // Tauri replaces this HTML nonce at runtime. Apply it before xterm inserts
      // its font, ANSI palette, cursor, dimension, and scrollbar styles.
      const createStyle = `function cloudtermCreateStyleElement(doc) {
        const style = doc.createElement("style");
        const nonce = doc.querySelector('meta[property="csp-nonce"]')?.nonce;
        if (nonce && nonce !== "__TAURI_STYLE_NONCE__") style.nonce = nonce;
        return style;
      }\n`

      return {
        code: createStyle + code.replace(styleCreation, 'cloudtermCreateStyleElement($1)'),
        map: null,
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [xtermFrozenPrototypeCompat(), xtermStyleNonceCompat(), react()],
  optimizeDeps: {
    exclude: ['@xterm/xterm'],
  },
})
