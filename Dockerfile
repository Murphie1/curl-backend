#Builder
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runner stage with proper kubectl on Alpine
FROM node:18-alpine AS runner

WORKDIR /app

# Install kubectl using Alpine's package manager
RUN apk add --no-cache kubectl

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
