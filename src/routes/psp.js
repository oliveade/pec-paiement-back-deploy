const express = require('express')
const router = express.Router();
const axios = require('axios');
const Transaction = require('../models/Transaction');
const Operation = require('../models/Operation');

router.post('/callback', async (req, res) => {
  const { transactionId, status } = req.body;

  if (!transactionId || !status) {
    return res.status(400).json({ error: 'transactionId et status requis' });
  }

  try {
    const transaction = await Transaction.findByPk(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }
    transaction.status = status;
    await transaction.save();

    const existingOperation = await Operation.findOne({
      where: {
        transactionId: transaction.id,
        type: 'capture',
        status: status
      }
    });

    if (!existingOperation) {
      await Operation.create({
        transactionId: transaction.id,
        type: 'capture',
        status,
        amount: transaction.amount
      });
    } else {
      console.log(`[CALLBACK] Opération déjà existante pour transaction ${transaction.id}`);
    }
    if (transaction.callbackUrl) {
      try {
        await axios.post(transaction.callbackUrl, {
          transactionId: transaction.id,
          status,
          amount: transaction.amount,
          currency: transaction.currency
        });
        console.log(`[CALLBACK] Webhook envoyé au marchand pour transaction ${transaction.id}`);
      } catch (err) {
        console.error(`[CALLBACK] Erreur webhook marchand : ${err.message}`);
      }
    }

    res.json({ message: `Callback traité avec succès pour transaction ${transactionId}` });
  } catch (err) {
    console.error('[CALLBACK] Erreur serveur :', err.message);
    res.status(500).json({ error: 'Erreur lors du traitement du callback' });
  }
});


module.exports = router;
