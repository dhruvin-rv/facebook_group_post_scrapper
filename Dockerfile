# Use Node.js 20 slim version
FROM node:20-slim

# Install Chromium and required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    wget \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgtk-3-0 \
    libasound2 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libdbus-glib-1-2 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user with home directory
RUN groupadd -g 1001 scraper && useradd -u 1001 -g scraper -m -d /home/scraper scraper

# Create writable directories with proper permissions
RUN mkdir -p /usr/src/app/userData /usr/src/app/public/images /usr/src/app/configs \
    && chown -R scraper:scraper /usr/src/app

# Switch to non-root user
USER scraper

# Copy package files and install
COPY --chown=scraper:scraper package*.json ./
RUN npm install

# Copy app source
COPY --chown=scraper:scraper . .

# Build the application
RUN npm run build

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
