import react from "@vitejs/plugin-react";
import http from "node:http";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "u3-tauri-engine-proxy",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const port = Number(request.headers["x-u3-engine-port"]);
          if (!port || !request.url?.startsWith("/api/")) return next();
          delete request.headers["x-u3-engine-port"];
          const upstream = http.request({
            hostname: "127.0.0.1",
            port,
            method: request.method,
            path: request.url,
            headers: request.headers,
          }, result => {
            response.writeHead(result.statusCode ?? 502, result.headers);
            result.pipe(response);
          });
          upstream.on("error", error => {
            if (!response.headersSent) response.writeHead(502);
            response.end(error.message);
          });
          request.pipe(upstream);
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.VITE_ENGINE_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
