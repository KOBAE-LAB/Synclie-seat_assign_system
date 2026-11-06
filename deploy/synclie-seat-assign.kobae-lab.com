# /etc/nginx/sites-available/synclie-seat-assign.kobae-lab.com
# sites-enabled へシンボリックリンクして使う。
# 最初は 80 番のみで設置し、`certbot --nginx -d synclie-seat-assign.kobae-lab.com` で
# 443 番の設定と HTTP→HTTPS リダイレクトを Certbot に追記させる。

server {
    listen 80;
    listen [::]:80;
    server_name synclie-seat-assign.kobae-lab.com;

    # 教室レイアウト JSON 等の送信を想定した上限
    client_max_body_size 2m;

    access_log /var/log/nginx/synclie-seat-assign.access.log;
    error_log  /var/log/nginx/synclie-seat-assign.error.log;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;

    # /_next/static/ のキャッシュヘッダーは Next.js 側が付与する
    location / {
        proxy_pass http://127.0.0.1:3008;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 60s;
    }
}
