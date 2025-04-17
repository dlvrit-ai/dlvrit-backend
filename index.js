const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { payment_method, product_id, quantity, email, project } = req.body;

  try {
    const totalAmount = quantity * 16000; // £160 per minute

    // 1. Process payment
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

// 2. Create upload link via Massive.io
const portalId = process.env.MASSIVE_PORTAL_ID;

const response = await axios({
  method: 'post',
  url: `https://api.massive.app/v1/portals/uploads`,
  headers: {
    Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
    "Content-Type": "application/json"
  },
  data: {
    portal_id: portalId
  }
});

    const uploadUrl = response.data?.upload_url;

    if (!uploadUrl) {
      throw new Error("Failed to get upload URL from Massive.io");
    }

    // 3. Send confirmation email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: '"DLVRIT.ai" <noreply@dlvrit.ai>',
      to: email,
      subject: "Your DLVRIT.ai upload link",
      html: `
        <p>Thanks for your payment!</p>
        <p><strong>Project:</strong> ${project || "N/A"}<br>
        <strong>Minutes:</strong> ${quantity}<br>
        <strong>Upload link:</strong> <a href="${uploadUrl}">${uploadUrl}</a></p>
        <p>Please upload your file using the link above.</p>
      `
    });

    // 4. Return the link to the frontend as well
    res.send({ success: true, uploadUrl });

  } catch (error) {
    console.error("Error:", error.response?.status, error.response?.data || error.message);
res.status(error.response?.status || 500).send({
  error: error.response?.data?.message || error.message || "Unknown error"
});
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend with Stripe, Massive.io and email is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});