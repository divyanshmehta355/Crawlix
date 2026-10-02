FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set working directory
WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci
RUN npx playwright install chromium

# Copy project source
COPY . .

# Build the React production bundle into dist/
RUN npm run build

# Expose standard port
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Start the full-stack server (serves both API & React UI)
CMD ["npm", "start"]
