ARG APP_VERSION=1.1

FROM node:20-alpine
ARG APP_VERSION=1.1
LABEL org.opencontainers.image.version=$APP_VERSION

WORKDIR /app
ENV NODE_ENV=production
ENV MARIADB_HOST=mariadb
ENV MARIADB_PORT=3306
ENV MARIADB_DATABASE=erapport
ENV MARIADB_USER=erapport
ENV MARIADB_PASSWORD=erapport

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001
CMD ["node", "src/index.js"]
