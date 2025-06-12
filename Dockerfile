# Use Node.js 20 Alpine as base image for smaller size
FROM node:20-alpine

# Add necessary packages
RUN apk --no-cache add curl dumb-init

# Create app directory and set ownership
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with clean npm cache
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    TZ=UTC \
    NODE_OPTIONS="--max-old-space-size=4096" \
    MONGOOSE_BUFFERING_TIMEOUT=30000

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "index.js"]