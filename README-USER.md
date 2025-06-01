# Facebook Group Scraper - User Guide

A user-friendly service for collecting posts and images from Facebook groups. This guide will help you get started with using the service.

## Quick Start

1. **Configure Your Facebook Session**
   - Log into Facebook using incognito in your browser
   - Get your `c_user` and `xs` cookie values from the inspect element
   - Set up your session using the session configuration endpoint:

   **Endpoint:** `POST https://domain.com/session-config`
   
   **Request Body:**
   ```json
   {
     "userId": "user123",
     "configs": [
       {
         "key": "c_user",
         "value": "your_c_user_value"
       },
       {
         "key": "xs",
         "value": "your_xs_value"
       }
     ],
     "useProxy": true
   }
   ```
   
   Note: Save this `userId` as you'll need it for scraping jobs. If `useProxy` is set to true, a proxy will be automatically generated and assigned to your session.

2. **Start Scraping**

   **Endpoint:** `POST https://domain.com/scrapper`
   
   **Request Body:**
   ```json
   {
     "userId": "your_unique_id",
     "groups": ["group_id_1", "group_id_2"],
     "maxPostsAge": 24,
     "maxPostsFromGroup": 100,
     "webHookUrl": "https://your-webhook-url.com"
   }
   ```

## Parallel Scraping

To run multiple scraping jobs simultaneously:

1. **Create Multiple Sessions**

   **Endpoint:** `POST https://domain.com/session-config`
   
   **Request Body (First Session):**
   ```json
   {
     "userId": "user1",
     "configs": [
       {
         "key": "c_user",
         "value": "your_c_user_value"
       },
       {
         "key": "xs",
         "value": "your_xs_value"
       }
     ],
     "useProxy": true
   }
   ```

   **Request Body (Second Session):**
   ```json
   {
     "userId": "user2",
     "configs": [
       {
         "key": "c_user",
         "value": "your_c_user_value"
       },
       {
         "key": "xs",
         "value": "your_xs_value"
       }
     ],
     "useProxy": true
   }
   ```

2. **Start Multiple Jobs**

   **Endpoint:** `POST https://domain.com/scrapper`
   
   **Request Body (First Job):**
   ```json
   {
     "userId": "user1",
     "groups": ["group1", "group2"],
     "maxPostsAge": 24,
     "maxPostsFromGroup": 100,
     "webHookUrl": "https://your-webhook-url.com"
   }
   ```

   **Request Body (Second Job):**
   ```json
   {
     "userId": "user2",
     "groups": ["group3", "group4"],
     "maxPostsAge": 24,
     "maxPostsFromGroup": 100,
     "webHookUrl": "https://your-webhook-url.com"
   }
   ```

## Session Management

### Available Endpoints

1. **Set Session Configuration**
   - **Endpoint:** `POST https://domain.com/session-config`
   - **Description:** Configure a new session or update existing one
   - **Request Body:**
     ```json
     {
       "userId": "user123",
       "configs": [
         {
           "key": "c_user",
           "value": "your_c_user_value"
         },
         {
           "key": "xs",
           "value": "your_xs_value"
         }
       ],
       "useProxy": true
     }
     ```

2. **Get Session Configuration**
   - **Endpoint:** `GET https://domain.com/session-config/:userId`
   - **Description:** Retrieve session configuration for a user
   - **Response:**
     ```json
     {
       "userId": "user123",
       "configs": [
         {
           "key": "c_user",
           "value": "your_c_user_value"
         },
         {
           "key": "xs",
           "value": "your_xs_value"
         }
       ],
       "proxy": {
         "proxy": "username__password@host:port",
         "lastUpdated": "2024-03-20T12:00:00Z"
       }
     }
     ```

3. **Delete Session Configuration**
   - **Endpoint:** `DELETE https://domain.com/session-config/:userId`
   - **Description:** Remove session configuration for a user
   - **Response:** Success message

### Best Practices

1. **Session Security**
   - Use unique user IDs for different scraping needs
   - Keep your cookie values secure
   - Rotate sessions periodically
   - Delete unused sessions
   - Use proxies to avoid IP-based restrictions
   - Monitor proxy health and performance

2. **Proxy Usage**
   - Enable proxy usage by setting `useProxy: true` in session config
   - Each user session can have its own dedicated proxy
   - Proxies are automatically generated and assigned
   - Proxy configuration is stored securely
   - Monitor proxy performance and rotate if needed

3. **Parallel Scraping**
   - Create separate user IDs for parallel jobs
   - Monitor job status for each user ID
   - Don't exceed service limits
   - Use appropriate delays between jobs

## Features

- 📱 Easy-to-use API
- 🔄 Multiple group scraping
- 📸 Automatic image downloads
- ⏱️ Configurable time limits
- 📊 Post count controls
- 🔔 Real-time notifications
- 🛡️ Secure session handling

## How It Works

1. **Submit Your Request**
   - Provide your user ID
   - List the groups to scrape
   - Set your preferences
   - Add your webhook URL

2. **Monitor Progress**
   - Check job status
   - View progress updates
   - Receive completion notifications

3. **Get Results**
   - Receive data via webhook
   - Download images
   - Access post metadata

## API Reference

### Start Scraping

**Endpoint:** `POST /scrapper/start`

**Request Body:**
```json
{
  "userId": "your_user_id",
  "groups": ["group_id_1", "group_id_2"],
  "maxPostsAge": 24,
  "maxPostsFromGroup": 100,
  "webHookUrl": "https://your-webhook-url.com"
}
```

**Parameters:**
- `userId`: Your unique identifier
- `groups`: List of Facebook group IDs
- `maxPostsAge`: Maximum age of posts (hours)
- `maxPostsFromGroup`: Maximum posts per group
- `webHookUrl`: URL to receive results

### Check Status

**Endpoint:** `GET /scrapper/status/:userId`

**Response:**
```json
{
  "jobId": "job_123",
  "status": "running",
  "progress": {
    "totalGroups": 2,
    "completedGroups": 1,
    "totalPosts": 50,
    "totalImages": 25
  }
}
```

## Webhook Integration

### Receiving Results

Your webhook will receive data in this format:
```json
{
  "userId": "your_user_id",
  "data": {
    "group_id": {
      "post_id": {
        "timestamp": 1234567890,
        "date": "2024-03-20T12:00:00Z",
        "text": "Post content",
        "posterName": "User Name",
        "posterID": "user_id",
        "images": ["/images/image1.jpg", "/images/image2.jpg"],
        "url": "post_url",
        "postID": "post_id",
        "groupID": "group_id"
      }
    }
  }
}
```

### Webhook Requirements

- Must be HTTPS
- Should respond within 5 seconds
- Should return 2xx status code
- Should handle JSON payloads

## Best Practices

1. **Session Management**
   - Keep your session secure
   - Don't share your credentials
   - Report any issues immediately

2. **Rate Limits**
   - Don't exceed 5 concurrent jobs
   - Wait between large requests
   - Monitor your usage

3. **Data Handling**
   - Process webhook data promptly
   - Store images securely
   - Backup important data