# AssetVerse Backend - Setup Guide

## 📋 Project Structure

```
assetverse-backend/
├── index.js                 # Main server file
├── package.json            # Dependencies
├── .env                    # Environment variables (create from .env.example)
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore file
├── README.md             # Project documentation
└── routes/               # API routes (organize by feature)
    ├── auth.js
    ├── assets.js
    ├── requests.js
    ├── users.js
    └── payments.js
```

## 🚀 Installation & Setup

### 1. Clone/Create Project
```bash
mkdir assetverse-backend
cd assetverse-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
```bash
# Create .env file from example
cp .env.example .env

# Edit .env and add your credentials:
DB_USER=your_mongodb_user
DB_PASS=your_mongodb_password
JWT_SECRET=your_super_secret_key_123456
STRIPE_SECRET_KEY=your_stripe_key
```

### 4. Run Server
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Expected output:
```
✅ Connected to MongoDB
🚀 Server is running on port 5000
```

## 📡 API Endpoints

### Authentication Routes
```
POST   /api/auth/register-hr       → Register HR Manager
POST   /api/auth/register-employee → Register Employee
POST   /api/auth/login             → Login (returns JWT token)
```

### Asset Management Routes (HR Only)
```
POST   /api/assets                 → Add new asset
GET    /api/assets                 → Get all assets (with pagination)
GET    /api/assets/available       → Get available assets (for employees)
PUT    /api/assets/:id             → Update asset
DELETE /api/assets/:id             → Delete asset
```

### Request Management Routes
```
POST   /api/requests               → Create asset request (Employee)
GET    /api/requests               → Get all requests (HR Only)
PUT    /api/requests/:id/approve   → Approve request (HR Only)
PUT    /api/requests/:id/reject    → Reject request (HR Only)
```

### Employee Routes
```
GET    /api/my-assets              → Get employee's assigned assets
GET    /api/my-affiliations        → Get employee's company affiliations
PUT    /api/return-asset/:id       → Return an asset
```

### User Routes
```
GET    /api/user/profile           → Get user profile
PUT    /api/user/profile           → Update user profile
```

### Health Check
```
GET    /api/health                 → Server status
```

## 🔐 Authentication Flow

### Request Header Format
```
Headers: {
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

### Example Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hr@testcompany.com",
    "password": "password123"
  }'

# Response:
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "hr@testcompany.com",
    "name": "John Doe",
    "role": "hr"
  }
}
```

## 📝 Important Implementation Notes

### 1. Password Security ⚠️
Current implementation stores passwords in plain text. For production:
```javascript
// Install bcryptjs
npm install bcryptjs

// Hash password before storing
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash(password, 10);

// Verify password
const isMatch = await bcrypt.compare(password, user.password);
```

### 2. CORS Configuration
The current setup allows all origins. For production, update:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));
```

### 3. Error Handling
The server has basic error handling. Consider adding:
- Input validation (use joi or express-validator)
- Rate limiting
- Request logging
- More specific error messages

### 4. Database Indexing
For better performance, add indexes in MongoDB:
```javascript
// Create indexes
await usersCollection.createIndex({ email: 1 });
await assetsCollection.createIndex({ hrEmail: 1, companyName: 1 });
await requestsCollection.createIndex({ hrEmail: 1, requestStatus: 1 });
```

## 🧪 Testing API Endpoints

### Using cURL

#### 1. Register HR Manager
```bash
curl -X POST http://localhost:5000/api/auth/register-hr \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "companyName": "Tech Corp",
    "companyLogo": "https://example.com/logo.png",
    "email": "hr@techcorp.com",
    "password": "password123",
    "dateOfBirth": "1990-01-15"
  }'
```

#### 2. Add Asset (HR Only)
```bash
curl -X POST http://localhost:5000/api/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "productName": "Dell Laptop",
    "productImage": "https://example.com/laptop.jpg",
    "productType": "Non-returnable",
    "productQuantity": 10
  }'
```

#### 3. Get Assets (with pagination)
```bash
curl -X GET "http://localhost:5000/api/assets?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Using Postman
1. Create a new collection "AssetVerse"
2. Set up environment variables:
   - `base_url`: http://localhost:5000
   - `token`: (set after login)
3. Create requests for each endpoint

## 🔗 Frontend Integration

### Setting up API client
```javascript
// Frontend example (React)
const API_URL = 'http://localhost:5000/api';

// Login
const login = async (email, password) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  return data;
};

// Get Assets with token
const getAssets = async (page = 1, limit = 10) => {
  const token = localStorage.getItem('token');
  const response = await fetch(
    `${API_URL}/assets?page=${page}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.json();
};
```

## 📚 MongoDB Collections Setup

The following collections will be created automatically:
- `users` - User accounts (HR & Employees)
- `assets` - Company assets
- `requests` - Asset requests
- `assignedAssets` - Assigned assets to employees
- `employeeAffiliations` - Company-employee relationships
- `packages` - Subscription packages
- `payments` - Payment records

## 🐛 Troubleshooting

### MongoDB Connection Failed
- Check credentials in .env
- Ensure IP whitelist in MongoDB Atlas
- Verify network connectivity

### JWT Token Errors
- Check JWT_SECRET in .env
- Ensure token format: `Bearer {token}`
- Verify token expiration time

### CORS Errors
- Frontend and backend must be accessible
- Check CORS origins in index.js
- Ensure credentials are included in fetch

## 📦 Next Steps

1. ✅ Create route files in `/routes` directory for better organization
2. ✅ Add input validation middleware
3. ✅ Implement password hashing with bcryptjs
4. ✅ Add comprehensive error handling
5. ✅ Set up database indexes
6. ✅ Add request logging
7. ✅ Implement Stripe payment integration
8. ✅ Add email notifications
9. ✅ Deploy to production (Heroku, Railway, Vercel)

## 📞 Support

For issues:
1. Check console errors
2. Review MongoDB Atlas logs
3. Verify environment variables
4. Check firewall/network settings

Good luck! 🚀
