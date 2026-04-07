FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Cloud Run requires PORT 8080 by default
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Run with ts-node (transpile-only = fast, no type checking at runtime)
CMD ["npx", "ts-node", "--transpile-only", "src/server/Server.ts"]
