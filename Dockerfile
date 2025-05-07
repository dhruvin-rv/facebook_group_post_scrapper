# Use Node.js 20 version
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

# Set environment variable for Puppeteer to find Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN groupadd -r scraper && useradd -r -g scraper scraper

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Build the application
RUN npm run build

# Create directory for browser data and images with proper permissions
RUN mkdir -p /usr/src/app/userData /usr/src/app/public/images \
    && chown -R scraper:scraper /usr/src/app/userData /usr/src/app/public/images

# Switch to non-root user
USER scraper

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"] 