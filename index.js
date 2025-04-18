const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { product_id, quantity, email, project, promo } = req.body;

  try {
    let promoId = null;

    // Optional: Look up promotion code ID from code string
    if (promo) {
      const promoLookup = await stripe.promotionCodes.list({
        code: promo,
        active: true,
        limit: 1
      });

      if (promoLookup.data.length === 0) {
        return res.status(400).send({ error: "Invalid or inactive promo code." });
      }

      promoId = promoLookup.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price: product_id,
          quantity: quantity,
        }
      ],
      discounts: promoId ? [{ promotion_code: promoId }] : undefined,
      customer_email: email,
      metadata: {
        email,
        project,
        quantity,
        promo: promo || "none"
      },
      success_url: `${process.env.FRONTEND_URL}/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/cancelled.html`
    });

    res.send({ sessionId: session.id });
  } catch (err) {
    console.error("❌ Stripe Checkout session error:", err.message);
    res.status(500).send({ error: err.message });
  }
});

app.post("/checkout-success", async (req, res) => {
  const { session_id } = req.body;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const email = session.customer_email;
    const quantity = session.metadata.quantity;
    const project = session.metadata.project;

    console.log("✅ Stripe checkout successful for", email);

    // 1. Create MASV package
    const teamId = process.env.MASSIVE_TEAM_ID;
    const apiKey = process.env.MASSIVE_API_KEY;
    const description = project || "DLVRIT Finishing Job";

    const masvPayload = {
      description,
      name: "DLVRIT Upload",
      sender: email,
      recipients: [email]
    };

    console.log("📤 Sending MASV package request:");
    console.log(JSON.stringify(masvPayload, null, 2));

    const pkgRes = await axios.post(
      `https://api.massive.app/v1/teams/${teamId}/packages`,
      masvPayload,
      {
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    const accessToken = pkgRes.data?.access_token;
    if (!accessToken) throw new Error("MASV did not return an upload token");

    const portalURL = process.env.MASSIVE_PORTAL_URL;
    const password = process.env.MASSIVE_PORTAL_PASSWORD;
    const uploadUrl = `https://${portalURL}/upload/${accessToken}`;

    // 2. Send email
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
      from: '"DLVRIT.ai" <noreply@dlvrit.ai>',
      to: email,
      bcc: "orders@dlvrit.ai",
      subject: "🛠️ Upload your project to DLVRIT.ai",
      html: `
        <p>Hi there 👋</p>
        <p>Thanks for your order – we're all set to receive your file.</p>
        <p><strong>Project:</strong> ${project || "N/A"}<br/>
        <strong>Minutes:</strong> ${quantity}</p>
        <p>🚀 Please upload your file at the link below:</p>
        <p><a href="${uploadUrl}">${uploadUrl}</a></p>
        <p><strong>🔐 Portal password:</strong> ${password}</p>
        <p>Once we receive your upload, we’ll begin work immediately.</p>
        <p>Thanks again,<br/>The DLVRIT team ✨</p>
      `
    });

    res.send({ success: true });

  } catch (err) {
    console.error("❌ Unexpected error:");
    console.error("Status:", err.response?.status);
    console.error("Headers:", err.response?.headers);
    console.error("Data:", err.response?.data);
    console.error("Message:", err.message);

    res.status(err.response?.status || 500).send({
      error: err.response?.data?.message || err.message || "Unknown error"
    });
  }
});

app.post("/validate-promo-code", async (req, res) => {
  const { promo } = req.body;

  if (!promo) {
    return res.status(400).send({ error: "Promo code is required." });
  }

  try {
    const promotionCodes = await stripe.promotionCodes.list({
      code: promo,
      active: true,
      limit: 1
    });

    if (promotionCodes.data.length === 0) {
      return res.status(404).send({ error: "Promo code not found or inactive." });
    }

    res.send({ valid: true });
  } catch (err) {
    console.error("Promo validation error:", err);
    res.status(500).send({ error: "Internal server error validating promo code." });
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend is running with Stripe Checkout Sessions.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server listening on port", port);
});