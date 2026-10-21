FROM node:24.19.0-bookworm-slim AS node
FROM python:3.12.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
# The CA mount is only for managed CI builds; Mac Docker builds use system roots.
RUN --mount=type=secret,id=proxy_ca,required=false if [ -f /run/secrets/proxy_ca ]; then cp /run/secrets/proxy_ca /usr/local/share/ca-certificates/build-proxy.crt; update-ca-certificates; fi
WORKDIR /srv/veil/guest-web/matrix/integration
COPY guest-web/matrix/integration/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY guest-web/matrix/integration/package.json guest-web/matrix/integration/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY portable-provider/open_verifier.py /srv/veil/portable-provider/open_verifier.py
COPY relay/purpose_policy.py /srv/veil/relay/purpose_policy.py
COPY guest-web/src /srv/veil/guest-web/src
COPY guest-web/matrix/integration/*.py guest-web/matrix/integration/crypto-endpoint.mjs ./
COPY guest-web/matrix/pilot /srv/veil/guest-web/matrix/pilot
ENV VEIL_PILOT_RUNTIME=/data/runtime
RUN useradd --uid 10001 --create-home pilot && mkdir -p /data && chown -R pilot:pilot /data /srv/veil
USER pilot
CMD ["python", "../pilot/launch.py"]
