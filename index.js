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
    const usersCollection = db.collection("users");
    const hrAssetsCollection = db.collection("hrAssets");
    const requestAssetsCollection = db.collection("requestAssets");
    const employeeAssetsCollection = db.collection("employeeAssets");
    const affiliationsCollection = db.collection("affiliations");

    // employee assigned asset list
    app.get("/employeeAssets", async (req, res) => {
      const searchText = req.query.searchText;
      const filterType = req.query.type;
      const query = {};
      const options = { sort: { createdAt: -1 } };
      if (searchText) {
        query.productName = { $regex: searchText, $options: "i" };
      }
      // filter type
      // Type filter
      if (filterType) {
        query.productType = filterType; // <-- match returnable or non-returnable
      }
      const cursor = employeeAssetsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // request asset for the employee
    app.get("/requestAssets", async (req, res) => {
      const query = {};
      const options = { sort: { createdAt: -1 } };
      const cursor = requestAssetsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    //for the hr assets to get
    app.get("/hrAssets", async (req, res) => {
      const query = {};
      const options = { sort: { createdAt: -1 } };
      const cursor = hrAssetsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // to get by role to id
    app.get("/users/:id", (req, res) => {});

    // to get assigned
    app.get("/requestAssets", async (req, res) => {
      const query = {};

      const cursor = employeeAssetsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // to get by the role to email and role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    // request post for the employee
    app.post("/requestAssets", async (req, res) => {
      const {
        empplyeeName,
        productType,
        productName,
        productQuantity,
        productURL,
        note,
        status,
        createdAt,
      } = req.body;
      const hrAssetInfo = {
        empplyeeName,
        productType,
        productName,
        productQuantity,
        productURL,
        note,
        status,
        createdAt,
      };
      const result = await requestAssetsCollection.insertOne(hrAssetInfo);
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
    app.post("/em-users", async (req, res) => {
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

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne(employeeInfo);

        res.status(201).json(result);
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // for the managers
    app.post("/hr-users", async (req, res) => {
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

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne(managerInfo);

        res.status(201).json(result);
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/requestAssets/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;

      // Only run decrease logic if approving
      if (status === "approved") {
        const requestData = await requestAssetsCollection.findOne({
          _id: new ObjectId(id),
        });

        const assetId = requestData.assetId;

        if (assetId) {
          // Find the asset
          const assetData = await hrAssetsCollection.findOne({
            _id: new ObjectId(assetId),
          });

          // Check if quantity > 0
          if (!assetData || assetData.productQuantity <= 0) {
            return res.status(400).send({
              message: "Asset out of stock. Cannot approve.",
            });
          }

          // Decrease quantity
          await hrAssetsCollection.updateOne(
            { _id: new ObjectId(assetId) },
            { $inc: { productQuantity: -1 } }
          );
        }

        // ⭐ Insert into employee assigned assets
        const assignedAsset = {
          employeeEmail: requestData.employeeEmail,
          productType: requestData.productType,
          productName: requestData.productName,
          productQuantity: 1,
          productURL: requestData.productURL,
          companyName: requestData.companyName,
          requestDate: requestData.createdAt,
          approvalDate: new Date(),
          status: "approved",
        };

        await employeeAssetsCollection.insertOne(assignedAsset);

        // ⭐⭐⭐ ADD THIS: Create affiliation if not exists ⭐⭐⭐
        //  const existingUser = await usersCollection.findOne({ email });
        const alreadyAffiliated = await affiliationsCollection.findOne({
          employeeEmail: requestData.employeeEmail,
          companyName: requestData.companyName,
        });

        if (!alreadyAffiliated) {
          await affiliationsCollection.insertOne({
            employeeEmail: requestData.employeeEmail,
            companyName: requestData.companyName,
            createdAt: new Date(),
          });
        }
      }

      // Update request status
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await requestAssetsCollection.updateOne(query, updateDoc);

      res.send(result);
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
