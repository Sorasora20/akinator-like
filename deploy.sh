#!/bin/bash
# EC2 デプロイ用スクリプト

echo "======================================"
echo " Akinator アプリ デプロイプロセス開始 "
echo "======================================"

# フロントエンドのビルド
echo "1. フロントエンドの依存関係をインストールし、ビルドします..."
cd frontend
npm install
npm run build
cd ..

# バックエンドの準備
echo "2. バックエンドの依存関係をインストールします..."
cd hono-gemini
npm install

# PM2で起動 (デーモン化)
echo "3. PM2を使用してサーバーをバックグラウンド起動します..."
if ! command -v pm2 &> /dev/null
then
    echo "PM2が見つからないため、グローバルにインストールします..."
    sudo npm install -g pm2
fi

pm2 stop akinator-server 2>/dev/null || true
pm2 delete akinator-server 2>/dev/null || true
pm2 start "npm run start" --name "akinator-server"

echo "======================================"
echo " デプロイが完了しました！"
echo " サーバーはポート 8080 で稼働しています。"
echo " 必要に応じてEC2のセキュリティグループで ポート8080 のインバウンド許可を設定してください。"
echo "======================================"
