# Docker HTTPS Setup with Nginx

This setup wraps the application in nginx with HTTPS support using a self-signed certificate.

## Configuration

- **HTTPS Port**: 3003
- **HTTP Port**: 80 (redirects to HTTPS)
- **Backend Port**: 3001 (internal, proxied by nginx)
- **Host**: 10.21.16.43
- **API Subdomain**: api.10.21.16.43 (for domain names) or same origin with /api path (for IP addresses)

## Building the Docker Image

```bash
docker build -t mux-mastra-agent:latest .
```

## Running the Container

```bash
docker run -d \
  --name mux-mastra-agent \
  -p 80:80 \
  -p 3003:3003 \
  mux-mastra-agent:latest
```

Or with docker-compose:

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "80:80"
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - PORT=3001
```

## Accessing the Application

- **Frontend (HTTPS)**: https://10.21.16.43:3003
- **Backend API (same origin)**: https://10.21.16.43:3003/api
- **Backend API (subdomain)**: https://api.10.21.16.43:3003

**Note**: For IP addresses, `api.10.21.16.43` won't resolve via DNS. The frontend will automatically use the same origin with `/api` path. If you're using a domain name, the `api.<domain>` subdomain will work automatically.

## SSL Certificate

A self-signed SSL certificate is automatically generated on first startup. The certificate is stored in `/etc/nginx/ssl/` inside the container and includes both the main hostname and the `api.<hostname>` subdomain.

**Note**: Browsers will show a security warning for self-signed certificates. You'll need to accept the certificate exception to proceed.

**For IP addresses**: Since `api.10.21.16.43` won't resolve via DNS, you can either:
1. Add it to your `/etc/hosts` file: `10.21.16.43 api.10.21.16.43`
2. Use the same-origin API path: `https://10.21.16.43:3003/api` (handled automatically by the frontend)

## Architecture

- **Nginx**: Runs as root, handles HTTPS termination and reverse proxy
- **Backend**: Runs as `weatheruser`, serves the Node.js application on port 3001
- **Frontend**: Static files served directly by nginx from `/app/backend/frontend/dist`

## Troubleshooting

### Check if services are running

```bash
docker exec mux-mastra-agent ps aux
```

### View nginx logs

```bash
docker exec mux-mastra-agent cat /var/log/nginx/error.log
docker exec mux-mastra-agent cat /var/log/nginx/access.log
```

### View backend logs

```bash
docker logs mux-mastra-agent
```

### Regenerate SSL certificate

```bash
docker exec mux-mastra-agent /app/scripts/generate-ssl-cert.sh
docker restart mux-mastra-agent
```

