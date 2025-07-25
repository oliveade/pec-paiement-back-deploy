const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Transaction = sequelize.define(
  "Transaction",
  {
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    paymentUrl: {
      type: DataTypes.STRING,
    },
    redirectSuccessUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    redirectCancelUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    callbackUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    merchantId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    customerName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customerAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    items: {
      type: DataTypes.JSON,
      allowNull: true,
    }
  },
  {
    tableName: "transactions",
    timestamps: true,
  }
);

const MongoTransaction = require('./MongoTransaction');

Transaction.addHook('afterCreate', async (transaction) => {
    try {
        await MongoTransaction.create({
            postgresId: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            paymentUrl: transaction.paymentUrl,
            redirectSuccessUrl: transaction.redirectSuccessUrl,
            redirectCancelUrl: transaction.redirectCancelUrl,
            callbackUrl: transaction.callbackUrl,
            merchantId: transaction.merchantId,
            customerName: transaction.customerName,
            customerEmail: transaction.customerEmail,
            customerAddress: transaction.customerAddress,
            items: transaction.items,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt
        });
        console.log('Transaction synchronisée avec MongoDB');
    } catch (error) {
        console.error('Erreur sync MongoDB:', error);
    }
});

Transaction.addHook('afterUpdate', async (transaction) => {
    try {
        await MongoTransaction.updateOne(
            { postgresId: transaction.id },
            {
                amount: transaction.amount,
                currency: transaction.currency,
                status: transaction.status,
                paymentUrl: transaction.paymentUrl,
                redirectSuccessUrl: transaction.redirectSuccessUrl,
                redirectCancelUrl: transaction.redirectCancelUrl,
                callbackUrl: transaction.callbackUrl,
                merchantId: transaction.merchantId,
                customerName: transaction.customerName,
                customerEmail: transaction.customerEmail,
                customerAddress: transaction.customerAddress,
                items: transaction.items,
                updatedAt: new Date()
            }
        );
        console.log('Transaction mise à jour dans MongoDB');
    } catch (error) {
        console.error('Erreur update MongoDB:', error);
    }
});

module.exports = Transaction;

