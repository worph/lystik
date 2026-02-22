FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/

# Create data directory
RUN mkdir -p /data

# Set environment variables
ENV PORT=80
ENV DATA_DIR=/data

# Expose port
EXPOSE 80

# Define volume for persistence
VOLUME ["/data"]

# Start the server
CMD ["node", "src/server.js"]
