/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
                display: ["Rajdhani", "sans-serif"],
                mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
            },
        },
    },
    plugins: [],
};
