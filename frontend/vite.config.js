import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stations-server-gateway',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (!request.url?.startsWith('/api/stations')) return next()
          const dustboyToken = server.config.env.VITE_DUSTBOY_API_KEY
          const fetchJson = async (url, options = {}) => {
            const result = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
            if (!result.ok) throw new Error(`upstream HTTP ${result.status}`)
            return result.json()
          }
          const [air4thai, dustboy] = await Promise.allSettled([
            fetchJson('http://air4thai.pcd.go.th/services/getNewAQI_JSON.php'),
            dustboyToken
              ? fetchJson('https://open-api.cmuccdc.org/api/dustboy/stations', { headers: { Authorization: `Bearer ${dustboyToken}` } })
              : Promise.resolve({ stations: [] }),
          ])
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({
            air4thai: air4thai.status === 'fulfilled' ? air4thai.value : { stations: [] },
            dustboy: dustboy.status === 'fulfilled' ? dustboy.value : { stations: [] },
            errors: {
              air4thai: air4thai.status === 'rejected' ? String(air4thai.reason?.message || air4thai.reason) : null,
              dustboy: dustboy.status === 'rejected' ? String(dustboy.reason?.message || dustboy.reason) : null,
            },
          }))
        })
      },
    },
  ],
  server: {
    proxy: {
      '/api/air4thai': {
        target: 'http://air4thai.pcd.go.th',
        changeOrigin: true,
        rewrite: () => '/services/getNewAQI_JSON.php',
      },
    },
  },
})
