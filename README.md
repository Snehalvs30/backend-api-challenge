# Backend API Challenge - Report Management System

A production-quality RESTful API built with Node.js and TypeScript for managing reports with file attachments, async processing, and role-based access control.

##  Features

- Complete CRUD operations for reports
- JWT-based authentication with 3 roles (reader, editor, admin)
- File upload with validation and secure signed URLs
- Async side effects with retry logic and dead-letter queue
- Custom business rules for data validation
- Optimistic locking for concurrency control
- Comprehensive error handling with structured responses
- Request logging and audit trails

##  Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Authentication**: JWT (jsonwebtoken + bcrypt)
- **File Upload**: Multer
- **Data Storage**: In-memory NoSQL (Map-based)
- **Validation**: Zod + custom validators

##  Installation

### Prerequisites

- Node.js v18+ or v20+
- npm or pnpm

### Setup
```bash
# Install dependencies
npm install

# Create .env file
echo "PORT=3000
JWT_SECRET=your-super-secret-key-change-in-production
NODE_ENV=development" > .env

# Start development server
npm run dev
```

Server will start on `http://localhost:3000`

##  Authentication

All endpoints (except /health) require authentication.

### Register a User
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "editor1",
    "password": "securepass123",
    "role": "editor"
  }'
```

**Roles**: `reader`, `editor`, `admin`

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "editor1",
    "password": "securepass123"
  }'
```

**Response:**
```json
{
  "user": { "id": "...", "username": "editor1", "role": "editor" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Use the token** in subsequent requests:
```
Authorization: Bearer <token>
```

##  API Endpoints

###  Create Report

**POST** `/reports`
```bash
curl -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Q4 Sales Report",
    "description": "Comprehensive quarterly analysis",
    "metadata": {
      "department": "Sales",
      "confidentialityLevel": "internal",
      "estimatedReadTime": 20
    }
  }'
```

**Response:** 201 Created

**Triggers 3 async side effects:**
- 📧 Send notification
- 🗑️ Invalidate cache
- 🖼️ Generate preview

---

###  Get Report

**GET** `/reports/:id`
```bash
curl http://localhost:3000/reports/{report-id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Query Parameters:**
- `view=summary` - Compact summary view
- `include=entries,metadata` - Selective field inclusion
- `page=1&size=10` - Pagination for entries

**Examples:**
```bash
# Summary view
curl "http://localhost:3000/reports/{id}?view=summary" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Only metadata
curl "http://localhost:3000/reports/{id}?include=metadata" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Paginate entries
curl "http://localhost:3000/reports/{id}?page=2&size=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Computed Fields:**
The response includes computed metrics:
```json
{
  "computed": {
    "totalEntries": 10,
    "highPriorityCount": 3,
    "mediumPriorityCount": 5,
    "lowPriorityCount": 2,
    "totalComments": 15
  }
}
```

---

### Update Report

**PUT** `/reports/:id`
```bash
curl -X PUT http://localhost:3000/reports/{report-id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Q4 Sales Report - Updated",
    "description": "Updated with latest data",
    "version": 1
  }'
```

**⚠️ Important:** `version` field is **required** for optimistic locking.

**Response:** 200 OK (version incremented)

**Version Conflict Example:**
```bash
# If version doesn't match current version
{
  "error": {
    "code": "CONFLICT",
    "message": "Report has been modified by another user",
    "details": {
      "currentVersion": 3,
      "providedVersion": 1
    }
  }
}
```

---

###  Upload Attachment

**POST** `/reports/:id/attachment`
```bash
curl -X POST http://localhost:3000/reports/{report-id}/attachment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/document.pdf"
```

**Accepted file types:** PDF, JPEG, PNG, GIF, DOC, DOCX, XLS, XLSX, TXT, CSV  
**Max file size:** 5MB

**Response:** 201 Created
```json
{
  "id": "file-xyz-789",
  "fileName": "document.pdf",
  "size": 245678,
  "mimeType": "application/pdf",
  "uploadedAt": "2025-12-26T07:30:00.000Z",
  "uploadedBy": "editor1",
  "downloadUrl": "/api/files/file-xyz-789/download?token=abc&expires=1735200000",
  "expiresIn": 3600
}
```

**Download URL** is time-limited (1 hour) and cryptographically signed for security.

---

## Roles & Permissions

| Role | Read Reports | Create Reports | Update Reports | Upload Files |
|------|--------------|----------------|----------------|--------------|
| **reader** | ✅ | ❌ | ❌ | ❌ |
| **editor** | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ |

---

## 🎯 Custom Business Rule

### Archive Validation Rule

**Rule:** Published reports must have at least **3 high-priority entries** before they can be archived.

**Rationale:** Ensures quality control - only substantial published reports with significant high-priority content can be archived.

**Example:**
```bash
# Attempt to archive a published report with only 1 high-priority entry
curl -X PUT http://localhost:3000/reports/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "archived",
    "version": 2
  }'
```

**Error Response:**
```json
{
  "error": {
    "code": "INSUFFICIENT_HIGH_PRIORITY_ENTRIES",
    "message": "Cannot archive published report: requires at least 3 high-priority entries (currently has 1)",
    "details": {
      "currentStatus": "published",
      "attemptedStatus": "archived"
    }
  }
}
```

**Impact:**
- Validates on status transitions to `archived`
- Checks entry priority levels
- Returns clear, actionable error messages
- User can add more high-priority entries and retry

---

## ⚠️ Error Handling

All errors follow a consistent structure:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {
      // Context-specific information
    }
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400) - Invalid input
- `UNAUTHORIZED` (401) - Missing or invalid token
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource doesn't exist
- `CONFLICT` (409) - Version mismatch (optimistic locking)
- `BUSINESS_RULE_VIOLATION` (400) - Custom validation failed
- `INTERNAL_ERROR` (500) - Server error

---

## Project Structure
```
src/
├── controllers/        # Request handlers
│   ├── authController.ts
│   └── reportController.ts
├── middleware/         # Auth, validation, error handling
│   └── auth.ts
├── models/            # TypeScript interfaces
│   ├── Report.ts
│   └── User.ts
├── routes/            # Express route definitions
│   ├── authRoutes.ts
│   └── reportRoutes.ts
├── services/          # Business logic
│   ├── asyncTaskQueue.ts
│   ├── fileStorage.ts
│   └── reportValidator.ts
├── storage/           # Data store abstraction
│   └── DataStore.ts
├── utils/             # Helper functions
│   └── auth.ts
└── index.ts           # Application entry point
```

---

## Development
```bash
# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run linter (if configured)
npm run lint
```

---

## Implementation Highlights

### Async Task Queue
- Exponential backoff retry (2s, 4s, 8s...)
- Configurable max attempts per task type
- Dead-letter queue for failed tasks
- Observable with structured logging

### Optimistic Locking
- Version-based concurrency control
- Prevents lost updates
- Clear conflict resolution messages

### File Storage
- Abstracted storage interface
- In-memory for demo (easily swappable for S3/GCS)
- Signed URLs for secure downloads
- File type and size validation

### Audit Logging
- Tracks who changed what and when
- Structured JSON logs
- Includes before/after state for updates

---

## Testing

### Quick Test Sequence
```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"pass123","role":"editor"}'

# 2. Login (save token)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"pass123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 3. Create report (save ID)
REPORT_ID=$(curl -s -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test","description":"Test report","metadata":{"department":"IT","confidentialityLevel":"internal","estimatedReadTime":5}}' \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

# 4. Get report
curl http://localhost:3000/reports/$REPORT_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. Update report
curl -X PUT http://localhost:3000/reports/$REPORT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Updated Title","version":1}'

# 6. Upload file
echo "Test file content" > test.txt
curl -X POST http://localhost:3000/reports/$REPORT_ID/attachment \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt"
```

---

## Author- Snehal Shinde

Built as part of a backend engineering challenge demonstrating production-quality API design, TypeScript proficiency, and understanding of distributed systems patterns.

