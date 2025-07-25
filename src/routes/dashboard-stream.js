if (!process.env.MONGO_URI) {
	console.warn('MONGO_URI non défini, dashboard temps réel désactivé');
}
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let clients = [];

const MongoTransaction = require('../models/MongoTransaction');

async function calculateMetrics() {
	try {
		const totalRevenueResult = await MongoTransaction.aggregate([
			{ $match: { status: 'success' } },
			{ $group: { _id: null, total: { $sum: '$amount' } } }
		]);

		const totalRevenue = totalRevenueResult[0]?.total || 0;

		const totalTransactions = await MongoTransaction.countDocuments();

		const successfulTransactions = await MongoTransaction.countDocuments({ status: 'success' });

		const failedTransactions = await MongoTransaction.countDocuments({ status: 'failed' });

		const pendingTransactions = await MongoTransaction.countDocuments({ status: 'pending' });

		const cancelledTransactions = await MongoTransaction.countDocuments({ status: 'cancelled' });

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const dailyRevenueResult = await MongoTransaction.aggregate([
			{
				$match: {
					status: 'success',
					createdAt: { $gte: today }
				}
			},
			{ $group: { _id: null, total: { $sum: '$amount' } } }
		]);

		const dailyRevenue = dailyRevenueResult[0]?.total || 0;

		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

		const monthlyRevenueResult = await MongoTransaction.aggregate([
			{
				$match: {
					status: 'success',
					createdAt: { $gte: startOfMonth }
				}
			},
			{ $group: { _id: null, total: { $sum: '$amount' } } }
		]);

		const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

		const averageAmount = successfulTransactions > 0
			? totalRevenue / successfulTransactions
			: 0;

		const conversionRate = totalTransactions > 0
			? (successfulTransactions / totalTransactions) * 100
			: 0;

		return {
			totalRevenue: Math.round(totalRevenue * 100) / 100,
			dailyRevenue: Math.round(dailyRevenue * 100) / 100,
			monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
			totalTransactions,
			successfulTransactions,
			failedTransactions,
			pendingTransactions,
			cancelledTransactions,
			averageAmount: Math.round(averageAmount * 100) / 100,
			conversionRate: Math.round(conversionRate * 100) / 100,
			lastUpdated: new Date().toISOString()
		};
	} catch (error) {
		console.error('Erreur calcul métriques:', error);
		return null;
	}
}

function broadcastToClients(data) {
	const message = `data: ${JSON.stringify(data)}\n\n`;

	clients.forEach((client, index) => {
		try {
			client.write(message);
		} catch (error) {
			console.log('Client déconnecté, suppression de la liste');
			clients.splice(index, 1);
		}
	});

	console.log(`📡 Métriques envoyées à ${clients.length} client(s)`);
}

function startChangeStreamListener() {
	try {
		const db = mongoose.connection.db;
		const changeStream = db.collection('mongotransactions').watch();

		changeStream.on('change', async (change) => {
			console.log('Changement détecté dans les transactions:', change.operationType);

			const metrics = await calculateMetrics();

			if (metrics) {
				broadcastToClients({
					type: 'metrics_update',
					data: metrics
				});
			}
		});

		console.log('Change Stream MongoDB démarré');
	} catch (error) {
		console.error('Erreur Change Stream:', error);
	}
}

router.get('/', async (req, res) => {
	console.log('Nouvelle connexion SSE');

	if (mongoose.connection.readyState !== 1) {
		return res.status(503).json({ error: 'Base de données non connectée' });
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Cache-Control'
	});

	clients.push(res);

	try {
		const initialMetrics = await calculateMetrics();
		if (initialMetrics) {
			res.write(`data: ${JSON.stringify({
				type: 'initial_metrics',
				data: initialMetrics
			})}\n\n`);
		}
	} catch (error) {
		console.error('Erreur envoi métriques initiales:', error);
	}

	const heartbeat = setInterval(() => {
		try {
			res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
		} catch (error) {
			clearInterval(heartbeat);
		}
	}, 30000);

	req.on('close', () => {
		console.log('Client SSE déconnecté');
		clearInterval(heartbeat);
		clients = clients.filter(client => client !== res);
	});
});

router.post('/refresh', async (req, res) => {
	try {
		const metrics = await calculateMetrics();
		if (metrics) {
			broadcastToClients({
				type: 'manual_refresh',
				data: metrics
			});
			res.json({ success: true, message: 'Métriques rafraîchies' });
		} else {
			res.status(500).json({ success: false, message: 'Erreur calcul métriques' });
		}
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/status', (req, res) => {
	res.json({
		connectedClients: clients.length,
		mongoConnected: mongoose.connection.readyState === 1
	});
});

mongoose.connection.once('open', () => {
	console.log('Connexion Mongoose établie, démarrage du Change Stream...');
	startChangeStreamListener();
});

module.exports = router;