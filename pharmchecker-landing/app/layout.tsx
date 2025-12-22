import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmChecker",
  description: "바코드 기반 약품 조제 안전 지원 시스템"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
