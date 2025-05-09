# Facebook Group Scraper - Developer Documentation

A powerful and efficient tool for scraping posts from Facebook groups, built with NestJS and Puppeteer.

## Technical Stack

- NestJS (Backend Framework)
- Puppeteer (Browser Automation)
- TypeScript
- Docker (Containerization)
- Jest (Testing)

## Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd fb_scrapper
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
NODE_ENV=development
CHROMIUM_PATH=/path/to/chromium
USER_DATA_DIR=/path/to/user/data
```

4. Start the development server:
```bash
npm run start:dev
```

## Project Structure

```
src/
├── scrapper/              # Scraping logic
│   ├── scrapper.service.ts
│   └── dto/
├── scrape-tracker/        # Job tracking
│   └── scrape-tracker.service.ts
├── session-config/        # Session management
│   └── session-config.service.ts
└── main.ts               # Application entry point
```

## Architecture

### Core Components

1. **ScrapperService**
   - Handles browser automation
   - Manages concurrent scraping jobs
   - Processes GraphQL responses
   - Downloads and stores images

2. **ScrapeTrackerService**
   - Tracks job status
   - Manages abort controllers
   - Handles job completion
   - Provides job statistics

3. **SessionConfigService**
   - Manages Facebook session data
   - Handles cookie storage
   - Validates session integrity

### Key Features

- Concurrent job processing
- Resource isolation per job
- Automatic cleanup
- Error recovery
- Webhook integration

## API Documentation

### Endpoints

1. **POST /scrapper/start**
   ```typescript
   interface GetPostsDto {
     userId: string;
     groups: string[];
     maxPostsAge: number;
     maxPostsFromGroup: number;
     webHookUrl: string;
   }
   ```

2. **GET /scrapper/status/:userId**
   ```typescript
   interface ScrapeStatus {
     jobId: string;
     status: 'running' | 'completed' | 'failed';
     progress: {
       totalGroups: number;
       completedGroups: number;
       totalPosts: number;
       totalImages: number;
     };
   }
   ```

## Development Guidelines

### Code Style

- Follow TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper error handling
- Add JSDoc comments for public methods

### Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Error Handling

1. **Browser Errors**
   - Implement retry mechanisms
   - Handle browser crashes
   - Clean up resources

2. **Network Errors**
   - Implement timeout handling
   - Handle rate limiting
   - Manage connection issues

3. **Resource Management**
   - Monitor memory usage
   - Implement cleanup routines
   - Handle disk space issues

## Performance Optimization

1. **Browser Management**
   - Reuse browser instances
   - Implement connection pooling
   - Optimize page load times

2. **Memory Management**
   - Implement garbage collection
   - Monitor heap usage
   - Clean up unused resources

3. **Network Optimization**
   - Implement request batching
   - Use connection pooling
   - Optimize payload size

## Deployment

### Docker

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| NODE_ENV | Environment | Yes | development |
| CHROMIUM_PATH | Chromium path | No | - |
| USER_DATA_DIR | User data directory | No | ./userData |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes
4. Add tests
5. Update documentation
6. Create a Pull Request

### Pull Request Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation
- Provide clear commit messages

## License

[Your License Here] 