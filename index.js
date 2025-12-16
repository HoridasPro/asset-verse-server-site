const express = require("express");

const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

// for the tracking id
const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require(process.env.SECRET_SITE);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const { access } = require("fs");
function generateTrackingId() {
  const prefix = "ZAP"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-digit hex

  return `${prefix}-${date}-${randomPart}`;
}

app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).sent({ message: "unauthorized access" });
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
    const packagesCollection = db.collection("packages");
    const paymentCollection = db.collection("payment");
    const employeeCollection = db.collection("employees");

    // for the companies
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

        res.send(employee); // array or empty array if not found
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error fetching employee" });
      }
    });

    // app.listen(5000, () => console.log("Server running on port 5000"));
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
    // Empoyee list
    app.get("/users/employee", async (req, res) => {
      const query = {};
      const options = { sort: { createdAt: -1 } };
      const cursor = employeeCollection.find(query, options);
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
    // app.get("/users/:id", (req, res) => {});

    // // to get assigned
    // app.get("/requestAssets", async (req, res) => {
    //   const query = {};

    //   const cursor = employeeAssetsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // verify admin
    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decoded_email;
    //   const query = { email };
    //   const user = await employeeCollection.findOne(query);
    //   if (!user || user.rol !== "admin") {
    //     return res.status(403).sent({ message: "forbidden access" });
    //   }
    //   next();
    // };

    // hr users to get

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // // patch for the hr users
    app.patch("/users/hr-user/:id", async (req, res) => {
      const { id } = req.params;
      const roleInfo = req.body;

      const query = { _id: new ObjectId(id) };
      const updateInfo = {
        $set: {
          role: roleInfo.role,
        },
      };

    

      const result = await usersCollection.updateOne(query, updateInfo);
      res.send(result);
    });
    // for the user role
    app.get(
      "/users/:email/role",
      // verifyFBToken,
      // verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const query = { email };
        const user = await usersCollection.findOne(query);
        res.send({ role: user?.role || "user" });
      }
    );

    // to get from the employee package
    app.get("/employee-package/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollection.findOne(query);
      res.send(result);
    });

    // GET packages - সব package অথবা user-specific
    app.get("/packages", async (req, res) => {
      try {
        // console.log("QUERY EMAIL:", req.query.email); //
        const email = req.query.email; // যদি email query থাকে, সেই user এর packages fetch হবে
        const query = email ? { email } : {};
        const options = { sort: { createdAt: -1 } };

        const cursor = packagesCollection.find(query, options);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching packages:", error);
        res.status(500).json({ message: error.message });
      }
    });

    // // payment related apis
    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;
        const query = {};
        console.log("headers", req.headers);
        if (email) {
          query.hrEmail = email;
          if (email !== req.decoded_email) {
            res.status(403).send({ message: "forbidden access" });
          }
        }
        const options = { sort: { paidAt: -1 } };
        const cursor = paymentCollection.find(query, options);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.log("Error fetching payment", error);
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/packages", async (req, res) => {
      try {
        const { packageName, employeeLimit, price, email, paymentStatus } =
          req.body;

        // Required field check
        if (!packageName || !employeeLimit || !price || !email) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        // Duplicate check (same user + same package name)
        const existingPackage = await packagesCollection.findOne({
          email,
          packageName: packageName,
        });
        if (existingPackage) {
          return res
            .status(400)
            .json({ message: "Package already exists for this user" });
        }

        // 👉 Tracking ID generate (without any external library)
        const trackingId = `TRK-${Date.now()}-${Math.floor(
          Math.random() * 10000
        )}`;

        const newPackage = {
          packageName: packageName,
          employeeLimit,
          price,
          email,
          paymentStatus: paymentStatus || "pending",
          createdAt: new Date(),
          trackingId, // <-- tracking id added here
        };

        const result = await packagesCollection.insertOne(newPackage);
        res.status(201).json(result);
      } catch (error) {
        console.error("Error adding package:", error);
        res.status(500).json({ message: error.message });
      }
    });

    // request post for the employee
    app.post("/requestAssets", async (req, res) => {
      const {
        employeeName: employeeName,
        productType,
        productName,
        productQuantity,
        productURL,
        note,
        status,
        createdAt,
      } = req.body;
      const hrAssetInfo = {
        employeeName: employeeName,
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

        const existingUser = await employeeCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const result = await employeeCollection.insertOne(employeeInfo);

        res.status(201).json(result);
      } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

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

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        // Insert new user
        const result = await usersCollection.insertOne(managerInfo);
        const userId = result.insertedId;

        // Default packages without email
        const defaultPackages = [
          {
            packageName: "Basic",
            employeeLimit: 55,
            price: 100,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
          },
          {
            packageName: "Standard",
            employeeLimit: 15,
            price: 900,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
          },
          {
            packageName: "Premium",
            employeeLimit: 30,
            price: 1900,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
          },
          {
            packageName: "Enterprise",
            employeeLimit: 999,
            price: 4900,
            userId,
            paymentStatus: "pay",
            createdAt: new Date(),
          },
        ];

        // ✅ Insert only if packageName doesn't exist for any user
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

    // for the managers
    // app.post("/hr-users", async (req, res) => {
    //   try {
    //     const {
    //       name,
    //       companyName,
    //       companyLogo,
    //       email,
    //       dateOfBirth,
    //       role,
    //       packageLimit,
    //       currentEmployees,
    //       subscription,
    //       createdAt,
    //     } = req.body;

    //     const managerInfo = {
    //       name,
    //       companyName,
    //       companyLogo,
    //       email,
    //       dateOfBirth,
    //       role,
    //       packageLimit,
    //       currentEmployees,
    //       subscription,
    //       createdAt,
    //     };

    //     const existingUser = await usersCollection.findOne({ email });
    //     if (existingUser) {
    //       return res.status(400).json({ message: "User already exists" });
    //     }

    //     const result = await usersCollection.insertOne(managerInfo);

    //     // ✅ FIXED defaultPackages (added correctly)
    //     const defaultPackages = [
    //       {
    //         packageName: "Basic",
    //         employeeLimit: 5,
    //         price: 100,
    //         // email: email,
    //         paymentStatus: "pay",
    //         createdAt: new Date(),
    //       },
    //       {
    //         packageName: "Standard",
    //         employeeLimit: 15,
    //         price: 900,
    //         // email: email,
    //         paymentStatus: "pay",
    //         createdAt: new Date(),
    //       },
    //       {
    //         packageName: "Premium",
    //         employeeLimit: 30,
    //         price: 1900,
    //         // email: email,
    //         paymentStatus: "pay",
    //         createdAt: new Date(),
    //       },
    //       {
    //         packageName: "Enterprise",
    //         employeeLimit: 999,
    //         price: 4900,
    //         // email: email,
    //         paymentStatus: "pay",
    //         createdAt: new Date(),
    //       },
    //     ];

    //     await packagesCollection.insertMany(defaultPackages);

    //     res.status(201).json({
    //       success: true,
    //       userId: result.insertedId,
    //     });
    //   } catch (error) {
    //     console.error("Server Error:", error);
    //     res.status(500).json({ message: "Server error" });
    //   }
    // });

    // payment checkout ralated apis

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
                currency: "usd", // ✅ lowercase
                unit_amount: amount,
                product_data: {
                  name: `Please pay for ${packageName}`,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: email, // ✅ FIXED

          // ✅ এখানেই metadata সঠিকভাবে
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

    //  payment cheackout
    // app.post("/payment-checkout-session", async (req, res) => {
    //   try {
    //     const paymentInfo = req.body;
    //     const amount = Number(paymentInfo.price) * 100;

    //     const session = await stripe.checkout.sessions.create({
    //       line_items: [
    //         {
    //           price_data: {
    //             currency: "USD",
    //             unit_amount: amount,
    //             product_data: {
    //               name: `Please pay for : ${paymentInfo.packageName} employee`, // FIXED
    //             },
    //           },
    //           quantity: 1,
    //         },
    //       ],
    //       mode: "payment",
    //       customer_email: paymentInfo.hr_manager_email,

    //       // metadata: {
    //       //   managerId: paymentInfo.managerId,
    //       //   packageName: paymentInfo.packageName,
    //       //   employeeLimit: paymentInfo.employeeLimit,
    //       // },
    //       metadata: {
    //         packageId: paymentInfo._id,
    //         packageName: paymentInfo.packageName,
    //         employeeLimit: paymentInfo.employeeLimit,
    //       },

    //       success_url: `${process.env.SITE_DOMAIN}/hr-dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //       cancel_url: `${process.env.SITE_DOMAIN}/hr-dashboard/payment-cancel`,
    //     });

    //     return res.send({ url: session.url });
    //   } catch (error) {
    //     console.error("Stripe Error:", error);
    //     return res
    //       .status(500)
    //       .json({ message: "Stripe Session Failed", error });
    //   }
    // });

    // ata perfectly kaj korese
    app.patch("/requestAssets/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;

      // Only run decrease logic if approving
      if (status === "Approved") {
        const requestData = await requestAssetsCollection.findOne({
          _id: new ObjectId(id),
        });

        // 🔹 Get employee info from users collection
        // Assume requestData has "employeeName" or some identifier to find the user
        const employee = await employeeCollection.findOne({
          name: requestData.employeeName, // যদি email না থাকে
        });

        if (!employee) {
          return res
            .status(404)
            .send({ message: "Employee not found in users collection" });
        }

        const companyName = employee?.companyName || "Unknown";
        // const employeeEmail = employee.email;

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
          companyName: companyName,
          requestDate: requestData.createdAt,

          approvalDate: new Date(),
          status: "Approved",
        };

        await employeeAssetsCollection.insertOne(assignedAsset);

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

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ error: "session_id missing" });
        }

        // 1️⃣ Stripe session fetch
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ error: "Payment not completed" });
        }

        // 2️⃣ metadata থেকে packageId
        const packageId = session.metadata.packageId;

        // 3️⃣ package update
        const updateResult = await packagesCollection.updateOne(
          { _id: new ObjectId(packageId) },
          {
            $set: {
              paymentStatus: "paid",
              paidAt: new Date(),
            },
          }
        );

        // 4️⃣ payment history save (check for duplicates)
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

        // 5️⃣ response
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

    // app.patch("/payment-success", async (req, res) => {
    //   try {
    //     const sessionId = req.query.session_id;
    //     if (!sessionId) {
    //       return res.status(400).send({ error: "session_id missing" });
    //     }
    //       const existingUser = await usersCollection.findOne({ sessionId });
    //     if (existingUser) {
    //       return res.status(400).json({ message: "User already exists" });
    //     }

    //     // 1️⃣ Stripe session fetch
    //     const session = await stripe.checkout.sessions.retrieve(sessionId);

    //     if (session.payment_status !== "paid") {
    //       return res.status(400).send({ error: "Payment not completed" });
    //     }

    //     // 2️⃣ metadata থেকে packageId
    //     const packageId = session.metadata.packageId;

    //     // 3️⃣ package update
    //     const updateResult = await packagesCollection.updateOne(
    //       { _id: new ObjectId(packageId) },
    //       {
    //         $set: {
    //           paymentStatus: "paid",
    //           paidAt: new Date(),
    //         },
    //       }
    //     );

    //     // 4️⃣ payment history save
    //     const payment = {
    //       hrEmail: session.customer_email,
    //       packageName: session.metadata.packageName,
    //       employeeLimit: Number(session.metadata.employeeLimit || 0),
    //       amount: Number(session.amount_total / 100),
    //       transactionId: session.payment_intent,
    //       paymentStatus: "paid",
    //       currency: session.currency,
    //       packageId: session.metadata.packageId,
    //       paidAt: new Date(),
    //     };

    //     const paymentResult = await paymentCollection.insertOne(payment);

    //     // 5️⃣ response
    //     res.send({
    //       success: true,
    //       message: "Payment successful",
    //       updatedPackage: updateResult,
    //       payment: paymentResult,
    //     });
    //   } catch (error) {
    //     console.error("Payment Success Error:", error);
    //     res.status(500).send({ error: error.message });
    //   }
    // });

    // for the return button
    app.patch("/employeeAssets/return/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const asset = await employeeAssetsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!asset) {
          return res.status(404).send({ error: "Asset not found" });
        }

        // Update employee asset status → Returned
        const updateEmployeeAsset = await employeeAssetsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Returned" } }
        );

        // Increase product inventory count
        const updateInventory = await hrAssetsCollection.updateOne(
          { _id: new ObjectId(asset.assetId) },
          { $inc: { quantity: 1 } }
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

    // employee delete
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
