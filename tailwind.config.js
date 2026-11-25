/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './pages/**/*.{js,jsx}',
        './components/**/*.{js,jsx}',
        './app/**/*.{js,jsx}',
        './src/**/*.{js,jsx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f6f1f9',
                    100: '#ece1f2',
                    200: '#d8c3e4',
                    300: '#bf9ed0',
                    400: '#a37bb8',
                    500: '#8d5fa5',
                    600: '#774790',
                    700: '#643a78',
                    800: '#522f62',
                    900: '#3f2449',
                },
                secondary: {
                    50: '#effaf3',
                    100: '#d7f3e1',
                    200: '#b0e6c4',
                    300: '#7fd3a2',
                    400: '#4dba7e',
                    500: '#2aa360',
                    600: '#228a50',
                    700: '#1c6e41',
                    800: '#195737',
                    900: '#144730',
                },
            },
            boxShadow: {
                soft: '0 1px 2px rgba(63,36,73,.05), 0 8px 24px -8px rgba(63,36,73,.12)',
                lift: '0 2px 4px rgba(63,36,73,.06), 0 18px 40px -12px rgba(63,36,73,.22)',
                glow: '0 0 0 1px rgba(255,255,255,.08), 0 8px 30px -6px rgba(141,95,165,.55)',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
