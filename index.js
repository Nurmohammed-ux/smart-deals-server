const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);
// const serviceAccount = require("./smart-deals-1be82-firebase-adminkey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());
const logger = (req, res, next) => {
  console.log("logging info");
  next();
};

// firebase token
const verifyFirebaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send("Unauthorized access: No token provided");
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send("Unauthorized access: No token provided");
  }
  // verify firebase token

  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    // console.log("after token validation", userInfo);
    next();
  } catch (error) {
    console.error("Firebase Auth Error:", error.message);
    return res
      .status(401)
      .send({ message: "Unauthorized access: Invalid token" });
  }
};

// custom token
const verifyJWTToken = (req, res, next) => {
  // console.log("in middleware", req.headers);
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ message: "Unauthorized access: No token provided" });
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .send({ message: "Unauthorized access: No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    // console.log("after decoded", decoded);
    req.token_email = decoded.email;
    // put it in the right place
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jd5uu0i.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Smart deals server is running");
});

async function run() {
  try {
    await client.connect();

    const database = client.db("smart_db");
    const productsCollection = database.collection("products");
    const bidsCollection = database.collection("bids");
    const usersCollection = database.collection("users");

    // jwt related api
    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    // USERS APIs
    app.post("/users", async (req, res) => {
      const newUser = req.body;

      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({
          message: "User already exists, do not need to insert user",
        });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // PRODUCTS APIs
    app.get("/products", async (req, res) => {
      // const projectFields = { title: 1, price_min: 1, price_max:1 };
      // const cursor = productsCollection
      //   .find()
      //   .sort({ price_min: 1 })
      //   .skip(2)
      //   .limit(5)
      //   .project(projectFields);

      // console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }

      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/latest-products", async (req, res) => {
      const cursor = productsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    app.post("/products", verifyFirebaseToken, async (req, res) => {
      const newProduct = {
        ...req.body,
        created_at: new Date(),
      };
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    // app.post("/products", verifyJWTToken, async (req, res) => {
    //   // console.log("from backend", req.headers);
    //   const newProduct = {
    //     ...req.body,
    //     created_at: new Date(),
    //   };
    //   const result = await productsCollection.insertOne(newProduct);
    //   res.send(result);
    // });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };
      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // bids related api
    // app.get("/bids", async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.get("/products/bids/:productId", async (req, res) => {
      const productId = req.params.productId;
      const query = { product: productId };
      const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // app.get("/bids", verifyJWTToken, async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_email = email;
    //   }

    //   // verify user have access to see this data
    //   if (email !== req.token_email) {
    //     return res.status(403).send({ message: "Forbidden access" });
    //   }
    //   const result = await bidsCollection
    //     .aggregate([
    //       { $match: query },
    //       {
    //         $addFields: {
    //           // Convert the string product ID to an ObjectId for the lookup
    //           productObjectId: { $toObjectId: "$product" },
    //         },
    //       },
    //       {
    //         $lookup: {
    //           from: "products",
    //           localField: "productObjectId", // Use the converted field
    //           foreignField: "_id",
    //           as: "productDetails",
    //         },
    //       },
    //       { $unwind: "$productDetails" },
    //     ])
    //     .toArray();
    //   res.send(result);
    // });

    app.get("/bids", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.buyer_email = email;
      }

      // verify user have access to see this data
      if (email !== req.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await bidsCollection
        .aggregate([
          { $match: query },
          {
            $addFields: {
              // Convert the string product ID to an ObjectId for the lookup
              productObjectId: { $toObjectId: "$product" },
            },
          },
          {
            $lookup: {
              from: "products",
              localField: "productObjectId", // Use the converted field
              foreignField: "_id",
              as: "productDetails",
            },
          },
          { $unwind: "$productDetails" },
        ])
        .toArray();
      res.send(result);
    });

    // app.get("/bids", logger, verifyFirebaseToken, async (req, res) => {
    //   // console.log(req.headers);
    //   const email = req.query.email;
    //   const query = email ? { buyer_email: email } : {};

    //   const result = await bidsCollection
    //     .aggregate([
    //       { $match: query },
    //       {
    //         $addFields: {
    //           // Convert the string product ID to an ObjectId for the lookup
    //           productObjectId: { $toObjectId: "$product" },
    //         },
    //       },
    //       {
    //         $lookup: {
    //           from: "products",
    //           localField: "productObjectId", // Use the converted field
    //           foreignField: "_id",
    //           as: "productDetails",
    //         },
    //       },
    //       { $unwind: "$productDetails" },
    //     ])
    //     .toArray();

    //   res.send(result);
    // });

    // bids api with firebase token
    // app.get("/bids", logger, verifyFirebaseToken, async (req, res) => {
    //   // console.log("after bid", req);
    //   try {
    //     const email = req.query.email;
    //     const query = email ? { buyer_email: email } : {};
    //     if (email !== req.token_email) {
    //       return res.status(403).send("Forbidden Access");
    //     }

    //     const result = await bidsCollection
    //       .aggregate([
    //         { $match: query },
    //         {
    //           $addFields: {
    //             // Convert the string product ID to an ObjectId for the lookup
    //             productObjectId: { $toObjectId: "$product" },
    //           },
    //         },
    //         {
    //           $lookup: {
    //             from: "products",
    //             localField: "productObjectId", // Use the converted field
    //             foreignField: "_id",
    //             as: "productDetails",
    //           },
    //         },
    //         { $unwind: "$productDetails" },
    //       ])
    //       .toArray();

    //     // Add 'return' to ensure the function stops here after sending
    //     return res.send(result);
    //   } catch (error) {
    //     console.error(error);
    //     // Use 'return' here too so this doesn't fall through to another res.send
    //     return res.status(500).send({ message: "Internal server error" });
    //   }
    // });

    app.post("/bids", async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

// app.listen(port, (req, res) => {
//   console.log(`Smart deals listening on port ${port}`);
// });
module.exports = app;

// client
//   .connect()
//   .then(() => {
//     app.listen(port, (req, res) => {
//       console.log(`Smart deals server listening on port ${port}`);
//     });
//   })
//   .catch(console.dir);
