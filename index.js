const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { payment_method, product_id, quantity, email, project, promo } = req.body;

  try {
    const totalAmount = quantity * 16000; // base price in pence
    console.log("📦 Stripe PaymentIntent:");
    console.log("→ Email:", email);
    console.log("→ Project:", project);
    console.log("→ Quantity:", quantity);
    console.log("→ Product ID:", product_id);
    if (promo) console.log("→ Promo Code:", promo);

    // Optional: apply promotion code if provided
    let discountId = null;
    if (promo) {
      const promoList = await stripe.promotionCodes.list({ code: promo, active: true });
      if (promoList.data.length === 0) throw new Error("Invalid or expired promo code.");
      discountId = promoList.data[0].id;
    }

    // 1) Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "gbp",
      payment_method,
      confirm: true,
      receipt_email: email,
      metadata: {
        email,
        project,
        quantity,
        promo: promo || "none"
      },
      ...(discountId && { discounts: [{ promotion_code: discountId }] })
    });

    // 2) Create MASV package
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

    // 3) Send confirmation email
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

    // 4) Return response
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

  try {
    const promoList = await stripe.promotionCodes.list({ code: promo, active: true });
    if (promoList.data.length > 0) {
      const promoCode = promoList.data[0];
      const coupon = await stripe.coupons.retrieve(promoCode.coupon.id);
      res.json({
        valid: true,
        percent_off: coupon.percent_off || 0,
        amount_off: coupon.amount_off || 0
      });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    console.error("Promo validation error:", error.message);
    res.json({ valid: false });
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Server listening on port", port);
});