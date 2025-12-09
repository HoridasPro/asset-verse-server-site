const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const hrAssetsCollection = db.collection("hrAssets");
    const requestAssetsCollection = db.collection("requestAssets");

    // request asset for the employee
    app.get("/requestAssets", async (req, res) => {
      const query = {};
      // const options = { sort: { createdAt: -1 } };
      const cursor = hrAssetsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //for the hu assets to get
    app.get("/hrAssets", async (req, res) => {
      const query = {};
      const options = { sort: { createdAt: -1 } };
      const cursor = hrAssetsCollection.find(query,options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // request post for the employee
app.post("/requestAssets", async (req, res) => {
      const {
        productType,
        productName,
        productQuantity,
        productURL,
        role,
        createdAt,
      } = req.body;
      const hrAssetInfo = {
        productType,
        productName,
        productQuantity,
        productURL,
        role,
        createdAt,
      };
      const result = await hrAssetsCollection.insertOne(hrAssetInfo);
      res.send(result);
    });

    // for the hr assets to post
    app.post("/hrAssets", async (req, res) => {
      const {
        productType,
        productName,
        productQuantity,
        productURL,
        role,
        createdAt,
      } = req.body;
      const hrAssetInfo = {
        productType,
        productName,
        productQuantity,
        productURL,
        role,
        createdAt,
      };
      const result = await hrAssetsCollection.insertOne(hrAssetInfo);
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

    // Asset delete
    app.delete("/hrAssets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await hrAssetsCollection.deleteOne(query);
      res.send(result);
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
