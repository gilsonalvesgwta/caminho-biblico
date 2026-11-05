FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-3100}/health || exit 1
CMD ["node", "--no-warnings", "server.js"]
