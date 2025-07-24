const express = require("express");
const router = express.Router();
const { Op, fn, col } = require('sequelize');
const isAdmin = require("../middleware/isAdmin");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
router.get("/stats", isAdmin, async (req, res) => {
  try {
    const merchants = await Merchant.count();
    const transactions = await Transaction.findAll({
      include: ["Operations"],
    });

    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const successCount = transactions.filter(
      (tx) => tx.status === "success"
    ).length;
    const successRate =
      transactions.length > 0
        ? ((successCount / transactions.length) * 100).toFixed(2)
        : 0;

    let totalCaptured = 0;
    let totalRefunded = 0;

    transactions.forEach((tx) => {
      tx.Operations?.forEach((op) => {
        if (op.type === "capture") totalCaptured += op.amount;
        if (op.type === "refund") totalRefunded += op.amount;
      });
    });

    res.json({
      merchants,
      transactions: transactions.length,
      totalAmount,
      successCount,
      successRate: parseFloat(successRate),
      totalCaptured,
      totalRefunded,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

router.get('/merchants', isAdmin, async (req, res) => {
  const { query } = req.query;

  try {
    const where = {};
    if (query) {
      where[Op.or] = [
        { companyName: { [Op.iLike]: `%${query}%` } },
        { contactEmail: { [Op.iLike]: `%${query}%` } }
      ];
    }

    const merchants = await Merchant.findAll({ where });
    res.json({ merchants });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des marchands', details: err.message });
  }
});
router.patch('/merchants/:id/toggle', isAdmin, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Marchand introuvable' });

    merchant.isActive = !merchant.isActive;
    await merchant.save();

    res.json({ message: `Marchand ${merchant.isActive ? 'activé' : 'désactivé'}`, merchant });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});
router.get("/transactions", isAdmin, async (req, res) => {
  const { query, status, merchantId } = req.query;
  const where = {};

if (query) {
    const isNumeric = !isNaN(query);
    where[Op.or] = [];

    if (isNumeric) {
      where[Op.or].push({ id: parseInt(query) });
    }
    where[Op.or].push({ '$Merchant.companyName$': { [Op.iLike]: `%${query}%` } });
  }


  if (status) {
    where.status = status;
  }

  if (merchantId) {
    where.merchantId = merchantId;
  }

  try {
    const transactions = await Transaction.findAll({
      where,
      include: [{ model: Merchant }],
    });

    res.json({ transactions });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({
        error: "Erreur lors de la récupération des transactions",
        details: err.message,
      });
  }
});
router.get('/stats/graph-data', isAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.findAll({
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', fn('CASE WHEN "status" = \'success\' THEN "amount" ELSE 0 END')), 'totalSuccess']
      ],
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']]
    });

    const result = {
      transactionsByDate: {},
      amountsByDate: {}
    };

    transactions.forEach(t => {
      const date = t.getDataValue('date');
      result.transactionsByDate[date] = parseInt(t.getDataValue('count'));
      result.amountsByDate[date] = parseFloat(t.getDataValue('totalSuccess')) || 0;
    });

    res.json(result);
  } catch (err) {
    console.error('Erreur stats graph :', err);
    res.status(500).json({ error: 'Erreur lors du chargement des données du graphique' });
  }
});
module.exports = router;
