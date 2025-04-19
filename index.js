const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

// ✅ Create Stripe Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const { product_id, quantity, email, project, promo } = req.body;

  try {
    console.log("📦 Stripe Checkout Session:");
    console.log("→ Email:", email);
    console.log("→ Project:", project);
    console.log("→ Quantity:", quantity);
    console.log("→ Product ID:", product_id);
    console.log("→ Promo Code:", promo);

    let promotionCodeId = undefined;

    if (promo) {
      const promoLookup = await stripe.promotionCodes.list({
        code: promo,
        active: true,
        limit: 1
      });

      if (promoLookup.data.length === 0) {
        return res.status(400).send({ error: "Promo code not valid" });
      }

      promotionCodeId = promoLookup.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price: product_id,
          quantity: quantity
        }
      ],
      discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
      customer_email: email,
      metadata: {
        email,
        project,
        quantity,
        promo: promo || "none"
      },
      success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancelled.html`
    });

    res.send({ url: session.url });

  } catch (err) {
    console.error("❌ Stripe Checkout session error:", err.message);
    res.status(500).send({ error: err.message });
  }
});

// ✅ Handle Checkout Success: send portal link email
app.post("/checkout-success", async (req, res) => {
  const { session_id } = req.body;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const email = session.customer_email;
    const quantity = session.metadata.quantity;
    const project = session.metadata.project;

    console.log("✅ Stripe checkout successful for", email);

    const portalURL = process.env.MASSIVE_PORTAL_URL;
    const password = process.env.MASSIVE_PORTAL_PASSWORD;

    const queryParams = new URLSearchParams({
      sender_email: email,
      package_name: project
    });

    const uploadUrl = `https://${portalURL}?${queryParams.toString()}`;

    // 📧 Send confirmation email
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
        <p>🚀 Please upload your file using the link below:</p>
        <p><a href="${uploadUrl}">${uploadUrl}</a></p>
        <p><strong>🔐 Portal password:</strong> ${password}</p>
        <p>📁 <a href="${process.env.FRONTEND_URL}/what-to-upload.html">Not sure what to upload? Here's a quick guide</a></p>
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

// ✅ Root endpoint for testing
app.get("/", (req, res) => {
  res.send("DLVRIT backend is running with Stripe Checkout Sessions.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server listening on port", port);
});