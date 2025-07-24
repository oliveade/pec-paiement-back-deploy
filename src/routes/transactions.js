const express = require("express");
const router = express.Router();
const axios = require("axios");
const Transaction = require("../models/Transaction");
const Operation = require("../models/Operation");
const authenticateToken = require("../middleware/auth");
const Merchant = require("../models/Merchant");

router.post("/", async (req, res) => {
  const appId = req.headers["appid"];
  const appSecret = req.headers["appsecret"];

  if (!appId || !appSecret) {
    console.log(appId);
    return res.status(401).json({ error: "Identifiants API manquants." });
  }

  try {
    const merchant = await Merchant.findOne({ where: { appId, appSecret } });
    console.log(merchant);
    if (!merchant || !merchant.isActive) {
      return res.status(403).json({ error: "Marchand non autorisé." });
    }

    const {
      amount,
      currency,
      redirectSuccessUrl,
      redirectCancelUrl,
      callbackUrl,
      customer,
      metadata,
    } = req.body;

    const transaction = await Transaction.create({
      amount,
      currency,
      merchantId: merchant.id,
      redirectSuccessUrl,
      redirectCancelUrl,
      callbackUrl,
      status: "created",
      customerName: customer?.name || null,
      customerEmail: customer?.email || null,
      customerAddress: customer?.address || null,
      items: metadata?.items || null,
    });

    const paymentUrl = `${process.env.FRONT_URL}/payment/${transaction.id}`;
    transaction.paymentUrl = paymentUrl;
    await transaction.save();

    res.status(201).json({
      message: "Transaction créée avec succès",
      transactionId: transaction.id,
      paymentUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

router.get("/merchant", authenticateToken, async (req, res) => {
  const transactions = await Transaction.findAll({
    where: { merchantId: req.user.merchantId },
    include: [Operation],
    order: [["createdAt", "DESC"]],
  });
  res.json({ transactions });
});

router.post("/pay/:id", async (req, res) => {
  const { id } = req.params;
  const { card } = req.body;

  try {
    const transaction = await Transaction.findByPk(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction introuvable" });
    }

    if (transaction.status !== "created") {
      return res
        .status(400)
        .json({ error: "Transaction déjà traitée ou invalide" });
    }

    transaction.status = "pending";
    await transaction.save();
    console.log("URL PSP utilisée :", `${process.env.PSP_URL}/psp/pay`);

    await axios.post(`${process.env.PSP_URL}/psp/pay`, {
      transactionId: transaction.id,
      amount: transaction.amount,
      callbackUrl: `${process.env.BASE_URL}/callback`,
      card,
    });

    console.log(
      `[BACKEND] Paiement lancé pour transaction ${transaction.id} (pending)`
    );

    res.json({ message: "Paiement lancé via le PSP mock." });
  } catch (err) {
    console.error("[BACKEND] Erreur PSP mock :", err.message);
    res.status(500).json({ error: "Erreur lors de l’appel au PSP mock" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const transaction = await Transaction.findByPk(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction introuvable" });
    }

    res.json({
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      redirectSuccessUrl: transaction.redirectSuccessUrl,
      redirectCancelUrl: transaction.redirectCancelUrl,
    });
  } catch (err) {
    console.error(
      "Erreur lors de la récupération de la transaction :",
      err.message
    );
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
