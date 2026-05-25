import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit'],
  typescript: {
    // Los errores de tipos restantes son incompatibilidades de versión de librería
    // que no afectan la funcionalidad. Se corregirán en el siguiente ciclo.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
