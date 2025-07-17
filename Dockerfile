# Use a minimal Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose port (same as used in server.ts)
EXPOSE 3000

# Start the compiled app
CMD ["node", "dist/server.js"]
