const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
console.log(stripe);
const port = process.env.PORT || 3000;

// for the tracking id
const crypto = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.SERVICE_ACCOUNT_TYPE,
    project_id: process.env.SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    private_key: process.env.SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL,
    client_id: process.env.SERVICE_ACCOUNT_CLIENT_ID,
    auth_uri: process.env.SERVICE_ACCOUNT_AUTH_URI,
    token_uri: process.env.SERVICE_ACCOUNT_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.SERVICE_ACCOUNT_AUTH_CERT_URL,
    client_x509_cert_url: process.env.SERVICE_ACCOUNT_CLIENT_CERT_URL,
    universe_domain: process.env.SERVICE_ACCOUNT_UNIVERSE_DOMAIN,
  }),
});
function generateTrackingId() {
  const prefix = "ZAP";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${randomPart}`;
}

// Middleware
app.use(express.json());
app.use(cors());

// Verify token
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

// MongoBD user name and password
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mulyrzf.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database
async function run() {
  try {
    await client.connect();
    const db = client.db("asset-verse-project");
    const usersCollection = db.collection("users");
    const hrAssetsCollection = db.collection("hrAssets");
    const requestAssetsCollection = db.collection("requestAssets");
    const employeeAssetsCollection = db.collection("employeeAssets");
    const affiliationsCollection = db.collection("affiliations");
    const packagesCollection = db.collection("packages");
    const paymentCollection = db.collection("payment");
    const employeeCollection = db.collection("employees");

    // admin verify token for the middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await employeeCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    app.get("/employee-request/top-assets", async (req, res) => {
      try {
        const result = await requestAssetsCollection
          .aggregate([
            {
              $group: {
                _id: {
                  productName: "$productName",
                  isReturnable: {
                    $cond: [{ $eq: ["$isReturnable", true] }, true, false],
                  },
                },
                requestCount: { $sum: 1 },
              },
            },
            { $sort: { requestCount: -1 } },
            { $limit: 5 },
            {
              $project: {
                _id: 0,
                productName: "$_id.productName",
                requestCount: 1,
                isReturnable: "$_id.isReturnable",
                productType: {
                  $cond: [
                    { $eq: ["$_id.isReturnable", true] },
                    "Returnable",
                    "Non-returnable",
                  ],
                },
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to load top assets" });
      }
    });

    // for the pdf
    app.get("/employeeAssets", async (req, res) => {
      const cursor = requestAssetsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // all apps
    app.get("/productType", async (req, res) => {
      try {
        const result = await requestAssetsCollection
          .aggregate([
            {
              $group: {
                _id: "$productType",
                requestCount: { $sum: 1 },
              },
            },
            { $sort: { requestCount: -1 } },

            {
              $project: {
                _id: 0,
                productType: "$_id",
                requestCount: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    /// Get profile
    app.get("/profile", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).send({ message: "Email missing" });
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    });

    //  Update profile
    app.patch("/profile", async (req, res) => {
      console.log("Patch data:", req.body);
      const { email, name, photoURL } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { name, photoURL } }
      );
      console.log("Mongo update result:", result);
      res.send(result);
    });

    // Get companies data
    app.get("/companies", async (req, res) => {
      try {
        const companies = await employeeCollection
          .aggregate([
            { $match: { role: "hr" } },
            {
              $group: {
                _id: "$companyName",
                name: { $first: "$companyName" },
              },
            },
          ])
          .toArray();
        res.send(companies);
      } catch (err) {
        res.status(500).send({ message: "Error fetching companies" });
      }
    });

    // get employees
    app.get("/employees", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res.status(400).send({ message: "Email is required" });

        const employee = await employeeCollection
          .find({ email: email, role: "employee" })
          .toArray();

        res.send(employee);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error fetching employee" });
      }
    });

    // // employee assigned assets list
    // app.get("/employeeAssets", async (req, res) => {
    //   const searchText = req.query.searchText;
    //   const filterType = req.query.type;
    //   const query = {};
    //   const options = { sort: { createdAt: -1 } };
    //   if (searchText) {
    //     query.productName = { $regex: searchText, $options: "i" };
    //   }

    //   // Type filter
    //   if (filterType) {
    //     query.productType = filterType;
    //   }
    //   const cursor = requestAssetsCollection.find(query, options);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // // Employees list
    // app.get("/users/employee", async (req, res) => {
    //   const query = {};
    //   const options = { sort: { createdAt: -1 } };
    //   const cursor = employeeCollection.find(query, options);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // // Request asset for the employee
    // app.get("/requestAssets", async (req, res) => {
    //   const query = {};
    //   const options = { sort: { createdAt: -1 } };
    //   const cursor = requestAssetsCollection.find(query, options).limit(10);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });
    // // To get data for the hr collection
    // app.get("/hrAssets", async (req, res) => {
    //   const query = {};
    //   const options = { sort: { createdAt: -1 } };
    //   const cursor = hrAssetsCollection.find(query, options).limit(10);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // //For the hr assets to get
    // app.get("/hrAssets/page", async (req, res) => {
    //   try {
    //     const limit = Number(req.query.limit) || 2;
    //     const page = Number(req.query.page) || 1;
    //     const skip = (page - 1) * limit;
    //     const total = await hrAssetsCollection.countDocuments();
    //     const cursor = hrAssetsCollection.find().skip(skip).limit(limit);
    //     const result = await cursor.toArray();
    //     res.send({
    //       data: result,
    //       total,
    //       page,
    //       totalPages: Math.ceil(total / limit),
    //     });
    //   } catch (error) {
    //     res.status(500).send({ message: "Failed to load HR assets" });
    //   }
    // });

    // // As a HR user
    // app.get("/users", verifyFBToken, async (req, res) => {
    //   const users = await usersCollection
    //     .find()
    //     .sort({ createdAt: -1 })
    //     .limit(5)
    //     .toArray();
    //   res.send(users);
    // });

    // // patch for the hr users
    // app.patch("/users/hr-user/:id", verifyFBToken, async (req, res) => {
    //   const { id } = req.params;
    //   const roleInfo = req.body;
    //   const query = { _id: new ObjectId(id) };
    //   const updateInfo = {
    //     $set: {
    //       role: roleInfo.role,
    //     },
    //   };
    //   const result = await usersCollection.updateOne(query, updateInfo);
    //   res.send(result);
    // });

    // // For the user role
    // app.get("/users/:email/role", async (req, res) => {
    //   const email = req.params.email;
    //   const query = { email };
    //   const user = await usersCollection.findOne(query);
    //   res.send({ role: user?.role || "user" });
    // });

    // // To get from the employee package
    // app.get("/employee-package/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await packagesCollection.findOne(query);
    //   res.send(result);
    // });

    // // Get packages
    // app.get("/packages", verifyFBToken, async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     const query = email ? { email } : {};
    //     const options = { sort: { createdAt: -1 } };
    //     const cursor = packagesCollection.find(query, options);
    //     const result = await cursor.toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.error("Error fetching packages:", error);
    //     res.status(500).json({ message: error.message });
    //   }
    // });

    // // Get payment
    // app.get("/payments", verifyFBToken, async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     const query = {};
    //     if (email) {
    //       if (email !== req.decoded_email) {
    //         return res.status(403).send({ message: "forbidden access" });
    //       }
    //       query.hrEmail = email;
    //     }
    //     const result = await paymentCollection
    //       .find(query)
    //       .sort({ paidAt: -1 })
    //       .toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.log("Error fetching payment", error);
    //     res.status(500).json({ message: error.message });
    //   }
    // });
    // app.post("/packages", async (req, res) => {
    //   try {
    //     const { packageName, employeeLimit, price, email, paymentStatus } =
    //       req.body;
    //     if (!packageName || !employeeLimit || !price || !email) {
    //       return res.status(400).json({ message: "Missing required fields" });
    //     }
    //     const existingPackage = await packagesCollection.findOne({
    //       email,
    //       packageName: packageName,
    //     });
    //     if (existingPackage) {
    //       return res
    //         .status(400)
    //         .json({ message: "Package already exists for this user" });
    //     }
    //     const trackingId = generateTrackingId();
    //     const newPackage = {
    //       packageName,
    //       employeeLimit,
    //       price,
    //       email,
    //       paymentStatus: paymentStatus || "pending",
    //       createdAt: new Date(),
    //       trackingId,
    //     };
    //     const result = await packagesCollection.insertOne(newPackage);
    //     res.status(201).json(result);
    //   } catch (error) {
    //     console.error("Error adding package:", error);
    //     res.status(500).json({ message: error.message });
    //   }
    // });

    // // Request post for the employee
    // app.post("/requestAssets", async (req, res) => {
    //   const {
    //     employeeName: employeeName,
    //     productType,
    //     productName,
    //     productQuantity,
    //     productURL,
    //     note,
    //     status,
    //     createdAt,
    //   } = req.body;
    //   const hrAssetInfo = {
    //     employeeName: employeeName,
    //     productType,
    //     productName,
    //     productQuantity,
    //     productURL,
    //     note,
    //     status,
    //     createdAt,
    //   };
    //   const result = await requestAssetsCollection.insertOne(hrAssetInfo);
    //   res.send(result);
    // });

    // For the hr assets to post
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

    // Employee Registration Route
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

    // For the post users
    app.post("/users", async (req, res) => {
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
        const userId = result.insertedId;
        const defaultPackages = [
          {
            packageName: "Basic",
            employeeLimit: 5,
            price: 5,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
            features: [
              "Asset Tracking",
              "Employee Management",
              "Basic Support",
            ],
          },
          {
            packageName: "Standard",
            employeeLimit: 10,
            price: 8,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
            features: [
              "All Basic features",
              "Advanced Analytics",
              "Priority Support",
            ],
          },
          {
            packageName: "Premium",
            employeeLimit: 20,
            price: 15,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
            features: [
              "All Standard features",
              "Custom Branding",
              "24/7 Support",
            ],
          },
        ];
        for (const pkg of defaultPackages) {
          const existingPackage = await packagesCollection.findOne({
            packageName: pkg.packageName,
          });
          if (!existingPackage) {
            await packagesCollection.insertOne(pkg);
          }
        }
        res.status(201).json({ success: true, userId });
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Payment checkout ralated apis
    app.post("/payment-checkout-session", async (req, res) => {
      try {
        const { price, packageId, email, packageName, employeeLimit } =
          req.body;

        const amount = Number(price) * 100;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",

          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: `Please pay for ${packageName}`,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: email,
          metadata: {
            packageId: packageId,
            packageName: packageName,
            employeeLimit: employeeLimit,
          },

          success_url: `${process.env.SITE_DOMAIN}/hr-dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/hr-dashboard/payment-cancel`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).json({ message: "Stripe Session Failed", error });
      }
    });

    //  Patch request assets
    app.patch("/requestAssets/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;

      if (status === "Approved") {
        const requestData = await employeeAssetsCollection.findOne({
          _id: new ObjectId(id),
        });
        const employee = await usersCollection.findOne({
          employeeEmail: requestData.email,
        });

        if (!employee) {
          return res
            .status(404)
            .send({ message: "Employee not found in users collection" });
        }
        const companyName = employee?.companyName || "Asset Verse";

        const assetId = requestData.assetId;

        if (assetId) {
          const assetData = await hrAssetsCollection.findOne({
            _id: new ObjectId(assetId),
          });

          if (!assetData || assetData.productQuantity <= 0) {
            return res.status(400).send({
              message: "Asset out of stock. Cannot approve.",
            });
          }
          await hrAssetsCollection.updateOne(
            { _id: new ObjectId(assetId) },
            { $inc: { productQuantity: -1 } }
          );
        }
        const assignedAsset = {
          email: requestData.email,
          productType: requestData.productType,
          productName: requestData.productName,
          productQuantity: 1,
          productURL: requestData.productURL,
          companyName: companyName,
          requestDate: requestData.createdAt,
          approvalDate: new Date(),
          status: "Approved",
        };

        await requestAssetsCollection.insertOne(assignedAsset);

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

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
          approvalDate: new Date(),
        },
      };
      const result = await requestAssetsCollection.updateOne(query, updateDoc);

      res.send(result);
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ error: "session_id missing" });
        }
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ error: "Payment not completed" });
        }

        const packageId = session.metadata.packageId;

        const updateResult = await packagesCollection.updateOne(
          { _id: new ObjectId(packageId) },
          {
            $set: {
              paymentStatus: "paid",
              paidAt: new Date(),
            },
          }
        );

        const existingPayment = await paymentCollection.findOne({
          transactionId: session.payment_intent,
        });

        let paymentResult = null;
        if (!existingPayment) {
          const payment = {
            hrEmail: session.customer_email,
            packageName: session.metadata.packageName,
            employeeLimit: Number(session.metadata.employeeLimit),
            amount: Number(session.amount_total / 100),
            transactionId: session.payment_intent,
            paymentStatus: "paid",
            currency: session.currency,
            packageId: session.metadata.packageId,
            paidAt: new Date(),
          };

          paymentResult = await paymentCollection.insertOne(payment);
        }

        res.send({
          success: true,
          message: "Payment successful",
          updatedPackage: updateResult,
          payment: paymentResult || existingPayment,
        });
      } catch (error) {
        console.error("Payment Success Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // For the return button
    app.patch("/employeeAssets/return/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const asset = await requestAssetsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!asset) {
          return res.status(404).send({ error: "Asset not found" });
        }

        const updateEmployeeAsset = await requestAssetsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Returned" } }
        );

        const updateInventory = await hrAssetsCollection.updateOne(
          { _id: new ObjectId(asset.assetId) },
          { $inc: { productQuantity: 1 } }
        );

        res.send({
          success: true,
          employeeAsset: updateEmployeeAsset,
          inventory: updateInventory,
        });
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // PATCH route for asset update
    app.patch("/hrAssets/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const {
          productName,
          productType,
          productQuantity,
          productURL,
          createdAt,
        } = req.body;

        const updateDoc = {
          productURL,
          productName,
          productType,
          productQuantity,
          createdAt,
        };

        if (productURL) updateDoc.productURL = productURL;

        const result = await hrAssetsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateDoc }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Asset updated" });
        } else {
          res.status(404).send({ success: false, message: "Asset not found" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Employee delete
    app.delete("/users/employee-team-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await employeeCollection.deleteOne(query);
      res.send(result);
    });

    // Asset delete
    app.delete("/hrAssets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await hrAssetsCollection.deleteOne(query);
      res.send(result);
    });

    // console.log("Connected to MongoDB Successfully");
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
