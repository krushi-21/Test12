import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['4173-ifgadvhp5sdrzpq108h4n-04321690.us2.manus.computer'],
  },
})
