FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and Playwright browser
RUN npm install
RUN npx playwright install chromium

# Copy project source and pre-built frontend
COPY . .

# Build frontend only if dist/index.html is not already present
RUN if [ ! -f "dist/index.html" ]; then npm run build; fi

# Expose standard port
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Start the full-stack server (serves both API & React UI)
CMD ["npm", "start"]
