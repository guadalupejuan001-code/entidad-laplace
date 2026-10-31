FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/registros/input && chown -R node:node /app/registros
USER node
CMD ["node","tools/laplace.mjs","entrada","iniciar","input/config.cluster.json"]
