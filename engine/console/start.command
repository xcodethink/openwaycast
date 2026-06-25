#!/usr/bin/env bash
# 双击启动 WayCast 控制台(macOS)。或命令行:node engine/console/server.mjs
cd "$(dirname "$0")/.." || exit 1
echo "启动 WayCast 控制台… 浏览器开 http://127.0.0.1:4178"
exec node console/server.mjs
