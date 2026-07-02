import express from "express";
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

    const result = await preference.create({
      body: {
        items: [
          {
            title,
            quantity: 1,
            unit_price: price,
            currency_id: "COP"
          }
        ],
        back_urls: {
          success: `${frontendUrl}/success`,
          failure: `${frontendUrl}/failure`,
          pending: `${frontendUrl}/pending`
        },
        auto_return: "approved",
        notification_url: `${apiUrl}/api/payments/webhook`,
        external_reference: String(userId),
        metadata: {
          userId,
          plan
        }
      }
    });

    res.json({
      init_point: result.init_point,
      id: result.id
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
    const userId = metadata.userId || metadata.user_id || payment.external_reference;
    const plan = metadata.plan;

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

    db.payments.push({
      id: db.payments.length + 1,
      provider: "mercadopago",
      providerPaymentId: payment.id,
      userId: Number(userId),
      plan,
      status: payment.status,
      amount: payment.transaction_amount,
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
