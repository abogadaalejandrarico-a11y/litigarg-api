import express from "express";
import client from "../services/mercadopago.js";
import { Preference } from "mercadopago";

const router = express.Router();

router.post("/create", async (req, res) => {
  try {
    const { userId, plan } = req.body;

    let price = 0;
    let title = "";

    if (plan === "premium_mensual") {
      price = 49000;
      title = "Litigarg Premium Mensual";
    } else if (plan === "premium_anual") {
      price = 490000;
      title = "Litigarg Premium Anual";
    } else {
      return res.status(400).json({ error: "Plan inválido" });
    }

    const preference = new Preference(client);

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
          success: "http://localhost:3000/success",
          failure: "http://localhost:3000/failure",
          pending: "http://localhost:3000/pending"
        },
        auto_return: "approved",
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

export default router;