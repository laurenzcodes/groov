import type { ElectrobunConfig } from "electrobun";

export default {
    app: {
        name: "Groov",
        identifier: "dev.groov.app",
        version: "0.0.1",
    },
    build: {
        // Vite builds to dist/, we copy from there
        copy: {
            "dist/index.html": "views/mainview/index.html",
            "dist/assets": "views/mainview/assets",
            "node_modules/ffmpeg-static": "vendor/ffmpeg-static",
            "node_modules/ffprobe-static/bin": "vendor/ffprobe-static/bin",
        },
        asarUnpack: [
            "**/vendor/ffmpeg-static/**",
            "**/vendor/ffprobe-static/bin/**",
        ],
        mac: {
            bundleCEF: false,
        },
        linux: {
            bundleCEF: false,
        },
        win: {
            bundleCEF: false,
        },
    },
} satisfies ElectrobunConfig;
