const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { payment_method, product_id, quantity, email, project } = req.body;

  try {
    const totalAmount = quantity * 16000; // Stripe expects pence, so £160 = 16000

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "gbp",
      payment_method: payment_method,
      confirm: true,
      receipt_email: email,
      metadata: {
        product_id,
        quantity,
        email,
        project
      }
    });

    res.send({ success: true });
  } catch (error) {
    console.error("Payment error:", error);
    res.status(400).send({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
