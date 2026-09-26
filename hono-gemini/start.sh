#!/bin/bash
# Hono サーバを起動するスクリプト

cd "$(dirname "$0")"

# 依存関係がインストールされていない場合はインストールする
if [ ! -d "node_modules" ]; then
    echo "node_modules が見つからないため、npm install を実行します..."
    npm install
fi

echo "Hono サーバを開発モードで起動します..."
npm run dev
