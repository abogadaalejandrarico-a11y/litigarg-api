import express from "express";
import crypto from "crypto";
import client from "../services/mercadopago.js";
import { Payment, Preference } from "mercadopago";
import { readDB, writeDB } from "../db/db.js";
import { activatePremiumSubscription } from "../services/subscription.js";
import { sendPremiumPurchasedEmail } from "../services/email.js";

const router = express.Router();

const plans = {
  premium: {
    price: 49999,
    title: "LitigARG Premium"
  },
  pro_mensual: {
    price: 49999,
    title: "LitigARG Premium"
  },
  plus_mensual: {
    price: 49999,
    title: "LitigARG Premium"
  },
  premium_mensual: {
    price: 49999,
    title: "LitigARG Premium"
  }
};

router.post("/create", async (req, res) => {
  try {
    const { userId, plan } = req.body;

    if (!userId || !plans[plan]) {
      return res.status(400).json({ error: "Plan invalido" });
    }

    const db = await readDB();
    const user = db.users.find(u => u.id === Number(userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const { price, title } = plans[plan];
    const preference = new Preference(client);
    const apiUrl = process.env.PUBLIC_API_URL || "https://litigarg-api.onrender.com";
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const orderId = [
      "litigarg",
      userId,
      plan,
      Date.now(),
      crypto.randomBytes(6).toString("hex")
    ].join(":");

    const result = await preference.create({
      body: {
        items: [
          {
            id: orderId,
            title,
            description: "Acceso Premium mensual a LitigARG",
            category_id: "services",
            quantity: 1,
            unit_price: price,
            currency_id: "COP"
          }
        ],
        payer: {
          name: user.username || "Cliente LitigARG",
          email: user.email,
          date_created: user.created_at || new Date().toISOString()
        },
        back_urls: {
          success: `${frontendUrl}/success`,
          failure: `${frontendUrl}/failure`,
          pending: `${frontendUrl}/pending`
        },
        auto_return: "approved",
        notification_url: `${apiUrl}/api/payments/webhook`,
        external_reference: orderId,
        metadata: {
          userId,
          plan,
          orderId
        }
      }
    });

    db.paymentAttempts = db.paymentAttempts || [];
    db.paymentAttempts.push({
      id: db.paymentAttempts.length + 1,
      orderId,
      preferenceId: result.id,
      userId: Number(userId),
      plan,
      status: "created",
      amount: price,
      created_at: new Date().toISOString()
    });
    await writeDB(db);

    res.json({
      init_point: result.init_point,
      id: result.id,
      orderId
    });
  } catch (error) {
    console.error("ERROR MERCADOPAGO:", error);

    if (error.cause) {
      console.error("CAUSE:", error.cause);
    }

    res.status(500).json({
      error: "Error creando preferencia",
      detalle: error.message
    });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const paymentId =
      req.query["data.id"] ||
      req.query.id ||
      req.body?.data?.id ||
      req.body?.id;

    const topic = req.query.topic || req.query.type || req.body?.type;

    if (!paymentId || (topic && topic !== "payment")) {
      return res.sendStatus(200);
    }

    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    const metadata = payment.metadata || {};
    const externalReference = payment.external_reference || "";
    const referenceParts = String(externalReference).split(":");
    const userId = metadata.userId || metadata.user_id || referenceParts[1] || externalReference;
    const plan = metadata.plan || referenceParts[2];
    const orderId = metadata.orderId || metadata.order_id || externalReference;

    if (!userId || !plans[plan]) {
      console.error("Pago sin metadata suficiente:", { paymentId, userId, plan });
      return res.sendStatus(200);
    }

    const db = await readDB();
    const user = (db.users || []).find(u => Number(u.id) === Number(userId));
    db.payments = db.payments || [];

    const alreadyProcessed = db.payments.some(p =>
      String(p.providerPaymentId) === String(payment.id) &&
      p.status === "approved"
    );

    if (alreadyProcessed) {
      return res.sendStatus(200);
    }

    db.paymentAttempts = db.paymentAttempts || [];
    const attempt = db.paymentAttempts.find(item => String(item.orderId) === String(orderId));
    if (attempt) {
      attempt.status = payment.status;
      attempt.statusDetail = payment.status_detail || null;
      attempt.providerPaymentId = payment.id;
      attempt.updated_at = new Date().toISOString();
    }

    db.payments.push({
      id: db.payments.length + 1,
      provider: "mercadopago",
      providerPaymentId: payment.id,
      userId: Number(userId),
      plan,
      status: payment.status,
      amount: payment.transaction_amount,
      orderId,
      statusDetail: payment.status_detail || null,
      created_at: new Date().toISOString()
    });

    await writeDB(db);

    if (payment.status === "approved") {
      const subscription = await activatePremiumSubscription(userId, plan, payment.id);

      if (user) {
        sendPremiumPurchasedEmail(user, subscription).catch(error =>
          console.error("ERROR ENVIANDO CORREO PREMIUM:", error)
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("ERROR WEBHOOK MERCADOPAGO:", error);
    res.sendStatus(500);
  }
});

export default router;
