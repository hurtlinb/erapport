ARG APP_VERSION=1.1

FROM node:20-alpine
ARG APP_VERSION=1.1
LABEL org.opencontainers.image.version=$APP_VERSION

WORKDIR /app
ENV NODE_ENV=production
ENV PGHOST=postgres
ENV PGPORT=5432
ENV PGDATABASE=erapport
ENV PGUSER=erapport
ENV PGPASSWORD=erapport

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001
CMD ["node", "src/index.js"]
