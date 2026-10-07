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

// https://vite.dev/config/
export default defineConfig({
  plugins: [xtermFrozenPrototypeCompat(), react()],
  optimizeDeps: {
    exclude: ['@xterm/xterm'],
  },
})
