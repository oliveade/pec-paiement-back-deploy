const express = require("express");
const validator = require("validator");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
const { Sequelize } = require('sequelize');
const crypto = require("crypto");
const { Op } = require('sequelize');

const mongoose = require('mongoose');
const MongoTransaction = require('../models/MongoTransaction');

const bcrypt = require("bcrypt");
const sendActivationEmail = require("../utils/sendActivationEmail");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    companyName,
    contactEmail,
    Kbis,
    contactName,
    contactPhone,
    password,
  } = req.body;

  if (
      !companyName ||
      !contactEmail ||
      !Kbis ||
      !contactName ||
      !contactPhone ||
      !password
  ) {
    return res.status(400).json({ error: "Tous les champs sont requis." });
  }

  if (!validator.isEmail(contactEmail)) {
    return res.status(400).json({ error: "Email invalide." });
  }

  if (!validator.isMobilePhone(contactPhone, "fr-FR")) {
    return res.status(400).json({ error: "Numéro de téléphone invalide." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Mot de passe trop court (min 6 caractères)." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const credentials = Merchant.generateCredentials();
    const activationToken = crypto.randomBytes(32).toString("hex");
    const baseUrl = process.env.BASE_URL;
    const activationLink = `${baseUrl}/merchants/activate/${activationToken}`;

    const newMerchant = await Merchant.create({
      companyName,
      Kbis,
      contactEmail,
      contactName,
      contactPhone,
      password: hashedPassword,
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      activationToken,
      isActive: false,
    });

    await sendActivationEmail(contactEmail, activationLink);

    res.status(201).json({
      message: "Marchand créé avec succès. Veuillez vérifier votre email pour activer votre compte.",
      merchant: {
        id: newMerchant.id,
        companyName: newMerchant.companyName,
        contactEmail: newMerchant.contactEmail,
        appId: newMerchant.appId,
        isActive: newMerchant.isActive,
      },
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Cet email est déjà utilisé par un autre marchand." });
    }
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

const verifyToken = require("../middleware/verifyToken");

router.get("/me", verifyToken, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.merchant.merchantId, {
      attributes: { exclude: ["appSecret"] },
    });

    if (!merchant) {
      return res.status(404).json({ error: "Marchand introuvable" });
    }

    res.json({ merchant });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

const authMiddleware = require("../middleware/auth");

router.post("/regenerate-credentials", authMiddleware, async (req, res) => {
  const merchantId = req.user.merchantId;

  try {
    const merchant = await Merchant.findByPk(merchantId);

    if (!merchant) {
      console.log(merchant);
      return res.status(404).json({ error: "Marchand introuvable." });
    }

    const newId = Merchant.generateCredentials().appId;
    const newSecret = Merchant.generateCredentials().appSecret;

    merchant.appSecret = newSecret;
    merchant.appId = newId;
    await merchant.save();

    res.json({
      message: "Nouveau APP_SECRET généré avec succès.",
      appSecret: newSecret,
      appId: newId,
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur", details: error.message });
  }
});

router.get("/activate/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const merchant = await Merchant.findOne({
      where: { activationToken: token },
    });

    if (!merchant) {
      return res.status(400).send("Lien d'activation invalide ou expiré.");
    }

    merchant.isActive = true;
    merchant.activationToken = null;
    await merchant.save();

    await sendCredentialsEmail(
        merchant.contactEmail,
        merchant.appId,
        merchant.appSecret
    );

    res.redirect(
        `${process.env.FRONT_URL}/activation-success?message=activated`
    );
  } catch (err) {
    res
    .status(500)
    .send("Une erreur est survenue lors de l'activation du compte.");
  }
});

router.get("/me/transactions", authenticateToken, async (req, res) => {
  try {
    const merchant = req.user;

    const transactions = await Transaction.findAll({
      where: { merchantId: merchant.merchantId },
      include: [Operation],
      order: [["createdAt", "DESC"]],
    });

    res.json({ transactions });
  } catch (err) {
    console.error(err);
    res
    .status(500)
    .json({ error: "Erreur lors du chargement des transactions" });
  }
});

router.get("/dashboard-stats", verifyToken, async (req, res) => {
  try {
    const merchantId = req.merchant.merchantId;

    const [successAmount, failedAmount, transactionsPerDay] = await Promise.all([
      Transaction.sum('amount', {
        where: { merchantId, status: 'success' }
      }),
      Transaction.sum('amount', {
        where: { merchantId, status: 'failed' }
      }),
      Transaction.findAll({
        where: { merchantId },
        attributes: [
          [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
        ],
        group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
        order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']]
      })
    ])

    const dailyStats = transactionsPerDay.map(t => ({
      date: t.dataValues.date,
      count: parseInt(t.dataValues.count)
    }))

    res.json({
      totalAmountSuccess: successAmount || 0,
      totalAmountFailed: failedAmount || 0,
      transactionsPerDay: dailyStats
    })
  } catch (err) {
    console.error("Erreur dashboard marchand :", err)
    res.status(500).json({ error: "Erreur serveur", details: err.message })
  }
})

router.get('/dashboard-stream', verifyToken, async (req, res) => {
  console.log('Nouvelle connexion SSE Marchand:', req.merchant.merchantId);

  if (mongoose.connection.readyState !== 1) {
    console.log('MongoDB non connecté, fallback sur Sequelize');
    return res.status(503).json({ error: 'Base de données MongoDB non connectée' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const merchantId = req.merchant.merchantId;

  async function calculateMerchantMetrics() {
    try {
      const totalAmountResult = await MongoTransaction.aggregate([
        { $match: { merchantId: merchantId, status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const totalAmountSuccess = totalAmountResult[0]?.total || 0;

      const totalAmountFailedResult = await MongoTransaction.aggregate([
        { $match: { merchantId: merchantId, status: 'failed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const totalAmountFailed = totalAmountFailedResult[0]?.total || 0;

      const totalTransactions = await MongoTransaction.countDocuments({ merchantId });
      const successfulTransactions = await MongoTransaction.countDocuments({
        merchantId,
        status: 'success'
      });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const transactionsPerDay = await MongoTransaction.aggregate([
        {
          $match: {
            merchantId: merchantId,
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            },
            count: { $sum: 1 },
            amount: { $sum: { $cond: [{ $eq: ["$status", "success"] }, "$amount", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            date: "$_id",
            count: 1,
            amount: 1
          }
        },
        { $sort: { date: 1 } }
      ]);

      return {
        totalTransactions,
        successfulTransactions,
        totalAmountSuccess: Math.round(totalAmountSuccess * 100) / 100,
        totalAmountFailed: Math.round(totalAmountFailed * 100) / 100,
        transactionsPerDay,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Erreur calcul métriques marchand:', error);
      return null;
    }
  }

  try {
    const initialMetrics = await calculateMerchantMetrics();
    if (initialMetrics) {
      res.write(`data: ${JSON.stringify(initialMetrics)}\n\n`);
      console.log('Métriques initiales envoyées au marchand', merchantId);
    }
  } catch (error) {
    console.error('Erreur envoi métriques initiales marchand:', error);
  }

  const updateInterval = setInterval(async () => {
    try {
      const metrics = await calculateMerchantMetrics();
      if (metrics) {
        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
        console.log('Métriques mises à jour pour marchand', merchantId);
      }
    } catch (error) {
      console.error('Erreur mise à jour stats marchand:', error);
      clearInterval(updateInterval);
    }
  }, 5000);

  req.on('close', () => {
    console.log('Client SSE Marchand déconnecté:', merchantId);
    clearInterval(updateInterval);
  });
});

router.post('/validate-credentials', async (req, res) => {
  const { appId, appSecret } = req.body;

  if (!appId || !appSecret) {
    return res.status(400).json({ error: 'Les credentials sont requis.' });
  }

  try {
    const merchant = await Merchant.findOne({
      where: {
        appId,
        appSecret
      },
      attributes: ['id', 'companyName']
    });

    if (!merchant) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    res.json({ merchant });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

module.exports = router;