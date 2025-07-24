const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");
const crypto = require("crypto");

const Merchant = sequelize.define(
  "Merchant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    companyName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    Kbis: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    appSecret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    activationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "merchants",
    timestamps: true,
  }
);

Merchant.generateCredentials = () => ({
  appId: crypto.randomBytes(16).toString("hex"),
  appSecret: crypto.randomBytes(32).toString("hex"),
});

module.exports = Merchant;
