import { Providers } from '@/components/providers/session-provider';
import './globals.css';

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                {/* Inter from Google Fonts; if it cannot load the system fonts in globals.css are used */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                <link rel="icon" href="/favicon.png" type="image/png" />
                <link rel="apple-touch-icon" href="/apple-icon.png" />
                <link rel="manifest" href="/manifest.json" />
            </head>
            <body className="font-sans antialiased" suppressHydrationWarning>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
