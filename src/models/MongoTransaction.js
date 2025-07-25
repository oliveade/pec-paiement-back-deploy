const mongoose = require('mongoose');

const MongoTransactionSchema = new mongoose.Schema({
	postgresId: { type: Number, required: true, unique: true },

	amount: { type: Number, required: true },
	currency: { type: String, required: true },
	status: {
		type: String,
		required: true,
		enum: ['created','pending', 'success', 'failed', 'cancelled'],
		default: 'pending'
	},
	paymentUrl: { type: String },
	redirectSuccessUrl: { type: String, required: true },
	redirectCancelUrl: { type: String, required: true },
	callbackUrl: { type: String },
	merchantId: { type: String, required: true },

	customerName: { type: String },
	customerEmail: { type: String },
	customerAddress: { type: String },

	items: { type: mongoose.Schema.Types.Mixed },

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MongoTransaction', MongoTransactionSchema);