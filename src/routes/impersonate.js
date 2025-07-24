const express = require('express')
const jwt = require('jsonwebtoken')
const Merchant = require('../models/Merchant')
const isAdmin = require('../middleware/isAdmin')

const router = express.Router()

router.post('/impersonate/:merchantId', isAdmin, async (req, res) => {
  const { merchantId } = req.params

  try {
    const merchant = await Merchant.findByPk(merchantId)
    if (!merchant) {
      return res.status(404).json({ error: 'Marchand introuvable' })
    }

    const token = jwt.sign(
      {
        merchantId: merchant.id,
        companyName: merchant.companyName,
        email: merchant.contactEmail
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    )

    res.json({ token })
  } catch (err) {
    console.error('Erreur impersonation :', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

module.exports = router
