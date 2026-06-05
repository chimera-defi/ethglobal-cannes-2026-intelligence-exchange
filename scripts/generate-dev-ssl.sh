#!/bin/bash
# SSL Certificate Generation for Development
# For production, use proper certificates from a trusted CA

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/infra/ssl"

mkdir -p "$SSL_DIR"

echo "🔐 Generating SSL certificates for development..."

# Generate CA certificate
openssl genrsa -out "$SSL_DIR/ca-key.pem" 4096
openssl req -new -x509 -days 365 -key "$SSL_DIR/ca-key.pem" -sha256 -out "$SSL_DIR/ca-cert.pem" -subj "/C=US/ST=State/L=City/O=Development/CN=Development CA"

# Generate PostgreSQL server certificate
openssl genrsa -out "$SSL_DIR/postgres-key.pem" 4096
openssl req -new -key "$SSL_DIR/postgres-key.pem" -out "$SSL_DIR/postgres-csr.pem" -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
openssl x509 -req -days 365 -in "$SSL_DIR/postgres-csr.pem" -CA "$SSL_DIR/ca-cert.pem" -CAkey "$SSL_DIR/ca-key.pem" -CAcreateserial -out "$SSL_DIR/postgres-cert.pem"

# Generate Redis server certificate
openssl genrsa -out "$SSL_DIR/redis-key.pem" 4096
openssl req -new -key "$SSL_DIR/redis-key.pem" -out "$SSL_DIR/redis-csr.pem" -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
openssl x509 -req -days 365 -in "$SSL_DIR/redis-csr.pem" -CA "$SSL_DIR/ca-cert.pem" -CAkey "$SSL_DIR/ca-key.pem" -CAcreateserial -out "$SSL_DIR/redis-cert.pem"

# Set appropriate permissions
chmod 600 "$SSL_DIR"/*-key.pem
chmod 644 "$SSL_DIR"/*-cert.pem "$SSL_DIR/ca-cert.pem"

echo "✅ SSL certificates generated successfully in $SSL_DIR"
echo ""
echo "⚠️  WARNING: These are self-signed certificates for development only."
echo "   For production, use certificates from a trusted CA like Let's Encrypt."