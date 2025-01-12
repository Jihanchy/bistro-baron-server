const express = require('express');
require('dotenv').config()
const cors = require('cors');
const jwt = require('jsonwebtoken')
const app = express()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000

// middleWare
app.use(express.json())
app.use(cors())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n2npp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const userCollection = client.db('bistroDB').collection('users')
        const menusCollection = client.db('bistroDB').collection('menus')
        const reviewCollection = client.db('bistroDB').collection('reviews')
        const cartCollection = client.db('bistroDB').collection('carts')
        const paymentCollection = client.db('bistroDB').collection('payments')

        // verify token
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized access' })
                }
                req.decoded = decoded
                next()
            })
        }
        // check isAdmin middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded?.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }
        // JWT related apis
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        // users related apis
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        // check is admin
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (req.decoded.email !== email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })
        })
        // create users
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const isExist = await userCollection.findOne(query)
            if (isExist) {
                return res.send({ message: 'user already exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user)
            res.send(result)
        })
        // create admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })
        // delete user
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })
        // menus related apis
        app.get('/menus', async (req, res) => {
            const cursor = await menusCollection.find().toArray()
            res.send(cursor)
        })
        // get specific menu
        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menusCollection.findOne(query)
            res.send(result)
        })
        // create menuitem
        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menuItem = req.body
            const result = await menusCollection.insertOne(menuItem)
            res.send(result)
        })
        // update menu item
        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id
            const menuItem = req.body
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: menuItem.name,
                    recipe: menuItem.recipe,
                    image: menuItem.image,
                    category: menuItem.category,
                    price: menuItem.price
                }
            }
            const result = await menusCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })
        // delete menu item
        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menusCollection.deleteOne(query)
            res.send(result)
        })
        // reviews related apis
        app.get('/reviews', async (req, res) => {
            const cursor = await reviewCollection.find().toArray()
            res.send(cursor)
        })
        // cart collection
        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const query = { buyer_email: email }
            const cursor = await cartCollection.find(query).toArray()
            res.send(cursor)
        })
        // add to carts
        app.post('/carts', async (req, res) => {
            const cartItem = req.body
            const result = await cartCollection.insertOne(cartItem)
            res.send(result)
        })
        // delete from carts
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = cartCollection.deleteOne(query)
            res.send(result)
        })

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body
            const amount = parseInt(price * 100)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ["card"]
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })
        // get email based payment
        app.get('/payments/:email', verifyToken, async (req,res) => {
            const email = req.params.email
            const query = {email : email}
            if(email !== req.decoded.email){
                return res.status(403).send({message: 'unauthorized access'})
            }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })
        // create payment
        app.post('/payment', async (req, res) => {
            const payment = req.body
            const paymentResult = await paymentCollection.insertOne(payment)
            console.log(payment)
            const query = {_id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            console.log(query)
            const deletedResult = await cartCollection.deleteMany(query)
            res.send({ paymentResult, deletedResult })
        })
        // get admin stats
        app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) => {
            const users = await userCollection.estimatedDocumentCount()
            const menuItems = await menusCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()
            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {$sum : '$price'}
                    }
                }
            ]).toArray()
            const revenue = result[0]?.totalRevenue || 0
            res.send({
                users,
                menuItems,
                orders,
                revenue

            })
        })
        // get order-stats
        app.get('/order-stats',verifyToken, verifyAdmin,  async(req,res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $lookup: {
                        from: 'menus',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id : '$menuItems.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItems.price'}
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }
            ]).toArray()
            res.send(result)
        })
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('boss is sitting')
})

app.listen(port, () => {
    console.log(`this bistro server is running on port : ${port}`)
})