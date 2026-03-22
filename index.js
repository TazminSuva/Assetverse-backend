const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ============= MIDDLEWARE =============
app.use(cors({
  origin: function(origin, callback) {
    callback(null, true); // Allow all origins to avoid CORS issues
  },
  credentials: true
}));
app.use(express.json());

// ============= MONGODB CONNECTION =============
const uri = `mongodb+srv://ass11:ass11@cluster0.iavnhb8.mongodb.net/ass11?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Database collections
let usersCollection;
let assetsCollection;
let requestsCollection;
let assignedAssetsCollection;
let employeeAffiliationsCollection;
let packagesCollection;
let paymentsCollection;

// Connect to MongoDB
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  try {
    await client.connect();
    const database = client.db("assetverse_db");
    
    usersCollection = database.collection("users");
    assetsCollection = database.collection("assets");
    requestsCollection = database.collection("requests");
    assignedAssetsCollection = database.collection("assignedAssets");
    employeeAffiliationsCollection = database.collection("employeeAffiliations");
    packagesCollection = database.collection("packages");
    paymentsCollection = database.collection("payments");
    
    isConnected = true;
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    // In serverless, do not process.exit()
  }
}

// Ensure connection before any routes
app.use(async (req, res, next) => {
  await connectDB();
  next();
});
app.get("/", (req, res) => {
  res.json("server runnung")
})
// ============= JWT & AUTHENTICATION MIDDLEWARE =============

// Verify JWT Token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// Verify HR Role
const verifyHR = (req, res, next) => {
  if (req.user?.role !== "hr") {
    return res.status(403).json({ message: "Access denied. HR only." });
  }
  next();
};

// ============= AUTHENTICATION ROUTES =============

// Register HR Manager
app.post("/api/auth/register-hr", async (req, res) => {
  try {
    const { name, companyName, companyLogo, email, password, dateOfBirth } = req.body;
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    
    // Create new HR user
    const newUser = {
      name,
      companyName,
      companyLogo,
      email,
      password, // ⚠️ In production, hash this with bcrypt
      dateOfBirth: new Date(dateOfBirth),
      role: "hr",
      packageLimit: 5,
      currentEmployees: 0,
      subscription: "basic",
      profileImage: companyLogo,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId, email, role: "hr" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    res.status(201).json({
      message: "HR registered successfully",
      token,
      user: { id: result.insertedId, email, name, role: "hr" }
    });
  } catch (error) {
    console.error("HR Registration Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Register Employee
app.post("/api/auth/register-employee", async (req, res) => {
  try {
    const { name, email, password, dateOfBirth } = req.body;
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    
    // Create new employee user
    const newUser = {
      name,
      email,
      password, // ⚠️ In production, hash this with bcrypt
      dateOfBirth: new Date(dateOfBirth),
      role: "employee",
      profileImage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId, email, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    res.status(201).json({
      message: "Employee registered successfully",
      token,
      user: { id: result.insertedId, email, name, role: "employee" }
    });
  } catch (error) {
    console.error("Employee Registration Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    // Verify password (⚠️ In production, use bcrypt comparison)
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyName: user.companyName || null
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============= ASSET ROUTES (HR ONLY) =============

// Add Asset
app.post("/api/assets", verifyToken, verifyHR, async (req, res) => {
  try {
    const { productName, productImage, productType, productQuantity } = req.body;
    const hrEmail = req.user.email;
    
    // Get HR company info
    const hrUser = await usersCollection.findOne({ email: hrEmail });
    
    const newAsset = {
      productName,
      productImage,
      productType,
      productQuantity,
      availableQuantity: productQuantity,
      dateAdded: new Date(),
      hrEmail,
      companyName: hrUser.companyName
    };
    
    const result = await assetsCollection.insertOne(newAsset);
    
    res.status(201).json({
      message: "Asset added successfully",
      asset: { _id: result.insertedId, ...newAsset }
    });
  } catch (error) {
    console.error("Add Asset Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get All Assets (HR's company assets)
app.get("/api/assets", verifyToken, verifyHR, async (req, res) => {
  try {
    const hrEmail = req.user.email;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get HR company info
    const hrUser = await usersCollection.findOne({ email: hrEmail });
    
    // Get assets with pagination
    const assets = await assetsCollection
      .find({ companyName: hrUser.companyName })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    // Get total count
    const total = await assetsCollection.countDocuments({ companyName: hrUser.companyName });
    
    res.json({
      assets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get Assets Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// Get Employees (HR's company affiliations)
app.get("/api/employees", verifyToken, verifyHR, async (req, res) => {
  try {
    const hrEmail = req.user.email;
    
    // Get HR company info
    const hrUser = await usersCollection.findOne({ email: hrEmail });
    
    // Get affiliated employees
    const employees = await employeeAffiliationsCollection
      .find({ companyName: hrUser.companyName })
      .toArray();

    // Map through them and get active asset counts
    const mappedEmployees = await Promise.all(employees.map(async (emp) => {
      const activeAssetsCount = await assignedAssetsCollection.countDocuments({
        employeeEmail: emp.employeeEmail,
        status: "assigned"
      });
      
      return {
        _id: emp._id,
        name: emp.employeeName,
        email: emp.employeeEmail,
        affiliationDate: emp.affiliationDate,
        assetsCount: activeAssetsCount,
        image: null
      };
    }));
    
    res.json({ employees: mappedEmployees });
  } catch (error) {
    console.error("Get Employees Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// Get Available Assets (for employees to request)
app.get("/api/assets/available", verifyToken, async (req, res) => {
  try {
    const assets = await assetsCollection
      .find({ availableQuantity: { $gt: 0 } })
      .toArray();
    
    res.json({ assets });
  } catch (error) {
    console.error("Get Available Assets Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update Asset
app.put("/api/assets/:id", verifyToken, verifyHR, async (req, res) => {
  try {
    const { productName, productImage, productType, productQuantity } = req.body;
    const assetId = new ObjectId(req.params.id);
    
    const result = await assetsCollection.updateOne(
      { _id: assetId },
      {
        $set: {
          productName,
          productImage,
          productType,
          productQuantity,
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ message: "Asset updated successfully" });
  } catch (error) {
    console.error("Update Asset Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete Asset
app.delete("/api/assets/:id", verifyToken, verifyHR, async (req, res) => {
  try {
    const assetId = new ObjectId(req.params.id);
    
    await assetsCollection.deleteOne({ _id: assetId });
    
    res.json({ message: "Asset deleted successfully" });
  } catch (error) {
    console.error("Delete Asset Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============= REQUEST ROUTES =============

// Create Asset Request (Employee)
app.post("/api/requests", verifyToken, async (req, res) => {
  try {
    const { assetId, note } = req.body;
    const requesterEmail = req.user.email;
    
    // Get employee info
    const employee = await usersCollection.findOne({ email: requesterEmail });
    
    // Get asset info
    const asset = await assetsCollection.findOne({ _id: new ObjectId(assetId) });
    
    const newRequest = {
      assetId: new ObjectId(assetId),
      assetName: asset.productName,
      assetType: asset.productType,
      requesterName: employee.name,
      requesterEmail,
      hrEmail: asset.hrEmail,
      companyName: asset.companyName,
      requestDate: new Date(),
      approvalDate: null,
      requestStatus: "pending",
      note,
      processedBy: null
    };
    
    const result = await requestsCollection.insertOne(newRequest);
    
    res.status(201).json({
      message: "Request submitted successfully",
      request: { _id: result.insertedId, ...newRequest }
    });
  } catch (error) {
    console.error("Create Request Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get All Requests (HR)
app.get("/api/requests", verifyToken, verifyHR, async (req, res) => {
  try {
    const hrEmail = req.user.email;
    
    const requests = await requestsCollection
      .find({ hrEmail })
      .sort({ requestDate: -1 })
      .toArray();
    
    res.json({ requests });
  } catch (error) {
    console.error("Get Requests Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Approve Request (HR)
app.put("/api/requests/:id/approve", verifyToken, verifyHR, async (req, res) => {
  try {
    const requestId = new ObjectId(req.params.id);
    const hrEmail = req.user.email;
    
    // Get request
    const request = await requestsCollection.findOne({ _id: requestId });
    
    // Check HR package limit
    const hr = await usersCollection.findOne({ email: hrEmail });
    if (hr.currentEmployees >= hr.packageLimit) {
      return res.status(400).json({ message: "Employee limit reached. Please upgrade." });
    }
    
    // Check if first affiliation
    const existingAffiliation = await employeeAffiliationsCollection.findOne({
      employeeEmail: request.requesterEmail,
      companyName: request.companyName
    });
    
    // Update request status
    await requestsCollection.updateOne(
      { _id: requestId },
      {
        $set: {
          requestStatus: "approved",
          approvalDate: new Date(),
          processedBy: hrEmail
        }
      }
    );
    
    // Deduct from available quantity
    await assetsCollection.updateOne(
      { _id: request.assetId },
      { $inc: { availableQuantity: -1 } }
    );
    
    // Create assigned asset
    const asset = await assetsCollection.findOne({ _id: request.assetId });
    await assignedAssetsCollection.insertOne({
      assetId: request.assetId,
      assetName: request.assetName,
      assetImage: asset.productImage,
      assetType: request.assetType,
      employeeEmail: request.requesterEmail,
      employeeName: request.requesterName,
      hrEmail: request.hrEmail,
      companyName: request.companyName,
      assignmentDate: new Date(),
      returnDate: null,
      status: "assigned"
    });
    
    // Create affiliation if first time
    if (!existingAffiliation) {
      await employeeAffiliationsCollection.insertOne({
        employeeEmail: request.requesterEmail,
        employeeName: request.requesterName,
        hrEmail: request.hrEmail,
        companyName: request.companyName,
        companyLogo: hr.companyLogo,
        affiliationDate: new Date(),
        status: "active"
      });
      
      // Increment HR's current employees
      await usersCollection.updateOne(
        { email: hrEmail },
        { $inc: { currentEmployees: 1 } }
      );
    }
    
    res.json({ message: "Request approved successfully" });
  } catch (error) {
    console.error("Approve Request Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Reject Request (HR)
app.put("/api/requests/:id/reject", verifyToken, verifyHR, async (req, res) => {
  try {
    const requestId = new ObjectId(req.params.id);
    const hrEmail = req.user.email;
    
    await requestsCollection.updateOne(
      { _id: requestId },
      {
        $set: {
          requestStatus: "rejected",
          processedBy: hrEmail
        }
      }
    );
    
    res.json({ message: "Request rejected successfully" });
  } catch (error) {
    console.error("Reject Request Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============= EMPLOYEE ROUTES =============

// Get My Assets (Employee)
app.get("/api/my-assets", verifyToken, async (req, res) => {
  try {
    const employeeEmail = req.user.email;
    
    const assets = await assignedAssetsCollection
      .find({ employeeEmail })
      .toArray();
    
    res.json({ assets });
  } catch (error) {
    console.error("Get My Assets Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get My Affiliations (Employee)
app.get("/api/my-affiliations", verifyToken, async (req, res) => {
  try {
    const employeeEmail = req.user.email;
    
    const affiliations = await employeeAffiliationsCollection
      .find({ employeeEmail })
      .toArray();
    
    res.json({ affiliations });
  } catch (error) {
    console.error("Get Affiliations Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Return Asset (Employee)
app.put("/api/return-asset/:id", verifyToken, async (req, res) => {
  try {
    const assignmentId = new ObjectId(req.params.id);
    const employeeEmail = req.user.email;
    
    const assignment = await assignedAssetsCollection.findOne({ _id: assignmentId });
    
    if (assignment.employeeEmail !== employeeEmail) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    
    // Update assignment
    await assignedAssetsCollection.updateOne(
      { _id: assignmentId },
      {
        $set: {
          status: "returned",
          returnDate: new Date()
        }
      }
    );
    
    // Increase available quantity
    await assetsCollection.updateOne(
      { _id: assignment.assetId },
      { $inc: { availableQuantity: 1 } }
    );
    
    res.json({ message: "Asset returned successfully" });
  } catch (error) {
    console.error("Return Asset Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============= USER ROUTES =============

// Get User Profile
app.get("/api/user/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    
    res.json({ user });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update User Profile
app.put("/api/user/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, profileImage } = req.body;
    
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          name,
          profileImage,
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ========PUBLIC APIS ========

// Get Packages
app.get("/api/packages", async (req, res) => {
  try {
    let packages = await packagesCollection.find().toArray();
    
    // Seed default packages if empty
    if (packages.length === 0) {
      const defaultPackages = [
        {
          name: 'Basic',
          price: '$5',
          employeeLimit: 5,
          features: ['Asset Tracking', 'Employee Management', 'Basic Support'],
          popular: false,
        },
        {
          name: 'Standard',
          price: '$8',
          employeeLimit: 10,
          features: ['All Basic features', 'Advanced Analytics', 'Priority Support'],
          popular: true,
        },
        {
          name: 'Premium',
          price: '$15',
          employeeLimit: 20,
          features: ['All Standard features', 'Custom Branding', '24/7 Support'],
          popular: false,
        },
      ];
      await packagesCollection.insertMany(defaultPackages);
      packages = await packagesCollection.find().toArray();
    }
    
    res.json({ packages });
  } catch (error) {
    console.error("Get Packages Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Stats
app.get("/api/stats", async (req, res) => {
  try {
    const totalCompanies = await usersCollection.countDocuments({ role: 'hr' });
    const totalAssets = await assetsCollection.countDocuments();
    
    res.json({
      stats: [
        { number: `${totalCompanies || 0}`, label: 'Companies Trust Us' },
        { number: `${totalAssets || 0}`, label: 'Assets Managed' },
        { number: '24/7', label: 'Support Available' },
      ]
    });
  } catch (error) {
    console.error("Get Stats Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ======== HEALTH CHECK ========
app.get("/api/health", (req, res) => {
  res.json({ status: "✅ Server is running", timestamp: new Date() });
});

// ======= ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ message: "Internal server error", error: err.message });
});

// ============= 404 HANDLER
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();

module.exports = app;
