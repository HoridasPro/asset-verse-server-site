const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mulyrzf.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("asset-verse-project");
    const employeesCollection = db.collection("employees");
    const managersCollection = db.collection("managers");
    const hrAssetsCollection = db.collection("hr-assets");

    // for the hr assets to get
    app.post("/hr-assets", async (req, res) => {
      const asset = req.body;
      const result = await hrAssetsCollection.insertOne(asset);
      res.send(result);
    });

    // 1️⃣ Employee Registration Route
    app.post("/employees", async (req, res) => {
      try {
        const { name, email, dateOfBirth, photoURL, role, createdAt } =
          req.body;

        const employeeInfo = {
          name,
          email,
          dateOfBirth,
          photoURL,
          role,
          createdAt,
        };

        const existingUser = await employeesCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const result = await employeesCollection.insertOne(employeeInfo);

        res.status(201).json(result);
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // for the managers
    app.post("/hr-managers", async (req, res) => {
      try {
        const {
          name,
          companyName,
          companyLogo,
          email,
          dateOfBirth,
          role,
          packageLimit,
          currentEmployees,
          subscription,
          createdAt,
        } = req.body;

        const managerInfo = {
          name,
          companyName,
          companyLogo,
          email,
          dateOfBirth,
          role,
          packageLimit,
          currentEmployees,
          subscription,
          createdAt,
        };

        const existingUser = await managersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const result = await managersCollection.insertOne(managerInfo);

        res.status(201).json(result);
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    console.log("Connected to MongoDB Successfully");
  } catch (error) {
    console.log(error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Asset verse backend running...");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
