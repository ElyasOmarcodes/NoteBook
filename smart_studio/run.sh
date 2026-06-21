#!/usr/bin/env bash
# Smart Studio - د چټک پیل سکریپټ
set -e
cd "$(dirname "$0")"
echo "📦 د کتابتونونو نصب..."
pip install -r requirements.txt
echo "🚀 د سمارټ سټوډیو پیل کیږي → http://127.0.0.1:5000"
python app.py
