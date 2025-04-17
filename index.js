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
    // 1. Process payment
    const totalAmount = quantity * 16000; // £160 per minute (in pence)
    await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "gbp",
      payment_method,
      confirm: true,
      receipt_email: email,
      metadata: { product_id, quantity, email, project }
    });

    // 2. Create upload package via Massive.io v1.1
    const portalId  = process.env.MASSIVE_PORTAL_ID;
    const portalUrl = process.env.MASSIVE_PORTAL_URL;  // e.g. "dlvrit.portal.massive.io"

    const pkgResponse = await axios.post(
      `https://api.massive.app/v1.1/portals/${portalId}/packages`,
      {
        description: project || "DLVRIT.ai post‑production job",
        name:        `Upload for ${email}`,
        sender:      email
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    // Build the actual upload URL from the returned access_token
    const token     = pkgResponse.data.access_token;
    const uploadUrl = `https://${portalUrl}/upload/${token}`;

    // 3. Send confirmation email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from:    `"DLVRIT.ai" <noreply@dlvrit.ai>`,
      to:      email,
      subject: "Your DLVRIT.ai upload link",
      html: `
        <p>Thanks for your payment!</p>
        <p><strong>Project:</strong> ${project || "N/A"}<br>
        <strong>Minutes:</strong> ${quantity}<br>
        <strong>Upload link:</strong> <a href="${uploadUrl}">${uploadUrl}</a></p>
        <p>Please upload your file using the link above.</p>
      `
    });

    // 4. Return upload link to frontend
    res.send({ success: true, uploadUrl });

  } catch (error) {
    console.error("Error:", error.response?.status, error.response?.data || error.message);
    res
      .status(error.response?.status || 500)
      .send({ error: error.response?.data?.message || error.message });
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend with Stripe, Massive.io and email is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});