import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppLayout } from "@/components/app-layout";
import { AuthRefreshRecovery } from "@/components/auth-refresh-recovery";
import { ThemeProvider } from "@/components/theme-provider";
import { PaletteProvider } from "@/components/palette-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hangar 13",
  description:
    "The training command center built for aviation maintenance. Track OJT, issue FAA-aligned coursework, and prove proficiency.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem("hangar-palette")==="classic"){document.documentElement.setAttribute("data-palette","classic")}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <PaletteProvider>
            <AuthRefreshRecovery />
            <AppLayout>{children}</AppLayout>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
