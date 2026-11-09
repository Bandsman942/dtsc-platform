FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv nftables \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/uv \
  && /opt/uv/bin/pip install --no-cache-dir 'uv==0.9.0' \
  && useradd --system --create-home --shell /usr/sbin/nologin dtsc-fetch

ENV PATH="/opt/uv/bin:${PATH}" \
    NODE_ENV=production \
    MCP_BRIDGE_BIND=0.0.0.0 \
    MCP_BRIDGE_PORT=8686
WORKDIR /app
COPY scripts/mcp-public-stdio-bridge.mjs scripts/mcp-public-stdio-security.mjs ./scripts/
COPY deploy/fly-fetch/start.sh deploy/fly-fetch/egress.nft ./deploy/fly-fetch/
RUN chmod 755 /app/deploy/fly-fetch/start.sh \
  && chown -R dtsc-fetch:dtsc-fetch /app

EXPOSE 8686
ENTRYPOINT ["/app/deploy/fly-fetch/start.sh"]
