import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Home klasöründeki eski package-lock.json'ın workspace root olarak algılanmasını engelle.
  outputFileTracingRoot: path.join(__dirname),
  // Tedarikçi sitelerinden hotlink edilen ürün görselleri. Hotlink testi yapıldı:
  // Enderyapı (images.bayipro.com) ve Levent (liste.leventsimsekarmatur.com)
  // domain-cross Referer ile 200 dönüyor. İkizler şu an Faz B kapsamında değil
  // ama domain whitelist'ine alındı; modal-tabanlı catalog için sonra.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.bayipro.com" },
      { protocol: "https", hostname: "liste.leventsimsekarmatur.com" },
      { protocol: "http", hostname: "bayi.ikizlerhirdavat.com" },
      // Yedekler İnşaat (010) — admin paneli CDN
      { protocol: "https", hostname: "adm.yedekler.com.tr" },
    ],
  },
};

export default nextConfig;
