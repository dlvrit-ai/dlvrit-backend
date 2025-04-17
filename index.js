const express    = require("express");
const app        = express();
const stripe     = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios      = require("axios");
const cors       = require("cors");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { payment_method, product_id, quantity, email, project } = req.body;

  try {
    const totalAmount = quantity * 16000; // £160 per minute

    console.log("📦 Stripe PaymentIntent:");
    console.log("→ Email:", email);
    console.log("→ Project:", project);
    console.log("→ Quantity:", quantity);
    console.log("→ Product ID:", product_id);

    // 1. Stripe PaymentIntent
    await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "gbp",
      payment_method,
      confirm: true,
      receipt_email: email,
      metadata: { product_id, quantity, email, project }
    });

    // 2. Create package via MASV (no wrapper)
    const teamId    = process.env.MASSIVE_TEAM_ID;
    const apiKey    = process.env.MASSIVE_API_KEY;
    const portalUrl = process.env.MASSIVE_PORTAL_URL;

    const masvPayload = {
      description: typeof project === "string" && project.trim()
        ? project.trim()
        : "Upload package for DLVRIT",
      name: "DLVRIT Upload",
      sender: email,
      recipients: [
        { email }
      ]
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
        },
        timeout: 10000
      }
    );

    let uploadUrl = pkgRes.data.upload_url;
    if (!uploadUrl && pkgRes.data.access_token) {
      uploadUrl = `https://${portalUrl}/upload/${pkgRes.data.access_token}`;
    }

    if (!uploadUrl) {
      throw new Error("MASV did not return an upload URL");
    }

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

    // 4. Respond to frontend
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
  res.send("DLVRIT backend with Stripe, Massive.io and email is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});