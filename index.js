const express    = require("express");
const app        = express();
const stripe     = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors       = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { payment_method, product_id, quantity, email, project } = req.body;

  try {
    // 1. Get Stripe price dynamically from product_id
    const price = await stripe.prices.retrieve(product_id);
    const unitAmount = price.unit_amount; // already in smallest currency unit
    if (!unitAmount) throw new Error("Could not retrieve Stripe unit amount");

    const totalAmount = unitAmount * quantity;
    const currency = price.currency || "gbp";

    const portalUrl = process.env.MASSIVE_PORTAL_URL; // e.g. dlvrit.portal.massive.io
    const portalPassword = process.env.MASV_PORTAL_PASSWORD;

    if (!portalPassword) {
      throw new Error("MASV portal password must be set in environment");
    }

    console.log("📦 Stripe PaymentIntent:");
    console.log("→ Email:", email);
    console.log("→ Project:", project);
    console.log("→ Quantity:", quantity);
    console.log("→ Product ID:", product_id);
    console.log("→ Total:", totalAmount, currency.toUpperCase());

    // 2. Create Stripe PaymentIntent
    await stripe.paymentIntents.create({
      amount: totalAmount,
      currency,
      payment_method,
      confirm: true,
      receipt_email: email,
      metadata: { product_id, quantity, email, project }
    });

    // 3. Construct MASV upload URL (no auto-redirect)
    const encodedProject = encodeURIComponent(project || "DLVRIT Upload");
    const encodedEmail   = encodeURIComponent(email);
    const uploadUrl = `https://${portalUrl}?name=${encodedProject}&email=${encodedEmail}`;

    // 4. Send confirmation email
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
      subject: "✅ Your DLVRIT upload link is ready!",
      html: `
        <p>Thanks for your payment! 🎉</p>
        <p><strong>Project:</strong> ${project || "N/A"}<br>
        <strong>Minutes:</strong> ${quantity}</p>
        <p>🚀 <strong>Upload your file here:</strong><br>
        <a href="${uploadUrl}">${uploadUrl}</a></p>
        <p>🔒 <strong>Portal Password:</strong> ${portalPassword}</p>
        <p>Please upload your file using the link above. No account required.<br>
        If you have any trouble, just reply to this email.</p>
        <p>– The DLVRIT Team</p>
      `
    });

    // 5. Respond to frontend
    res.send({ success: true, uploadUrl });

  } catch (err) {
    console.error("❌ Unexpected error:");
    console.error("Status:", err.response?.status);
    console.error("Headers:", err.response?.headers);
    console.error("Data:", err.response?.data);
    console.error("Message:", err.message);

    res.status(err.response?.status || 500).send({
      error: err.response?.data?.message || err.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("DLVRIT backend with Stripe, MASV Portal and email is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});