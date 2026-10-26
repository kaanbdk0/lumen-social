import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("jpeg");
// macOS 26'da headless Chrome GPU (ANGLE/Metal) çöküyor -> yazılım render.
// Bu olmadan render "Timed out connecting to the browser" ile takılıyor.
Config.setChromiumOpenGlRenderer("swiftshader");
