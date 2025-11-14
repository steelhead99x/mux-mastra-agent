#!/bin/sh
# Generate self-signed SSL certificate for nginx

set -e

SSL_DIR="/etc/nginx/ssl"
mkdir -p "$SSL_DIR"

# Generate private key
if [ ! -f "$SSL_DIR/server.key" ]; then
    echo "Generating SSL private key..."
    openssl genrsa -out "$SSL_DIR/server.key" 2048
    chmod 600 "$SSL_DIR/server.key"
fi

# Generate certificate signing request and self-signed certificate
if [ ! -f "$SSL_DIR/server.crt" ]; then
    echo "Generating SSL certificate..."
    openssl req -new -x509 -key "$SSL_DIR/server.key" \
        -out "$SSL_DIR/server.crt" \
        -days 365 \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=10.21.16.43" \
        -addext "subjectAltName=IP:10.21.16.43,DNS:api.10.21.16.43"
    chmod 644 "$SSL_DIR/server.crt"
fi

echo "SSL certificate generated successfully!"
echo "Certificate: $SSL_DIR/server.crt"
echo "Private key: $SSL_DIR/server.key"

