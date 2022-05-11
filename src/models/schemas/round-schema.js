import mongoose from "mongoose";

export default new mongoose.Schema({
    id: { type: Number, required: true },
    name: { type: String, required: true },
    memberId: { type: Number },
    siteId: { type: String },
    uid: { type: String },

    bet: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    freeSpin: { type: Boolean, default: false },

    result: { type: [Number] },

    odds: { type: Object },
    betWin: { type: Number, default: 0 },
    paid: { type: Boolean, default: false },
    time: { type: Date },
    endTime: { type: Date },

    partnerId: { type: String, require: true },
    currency: { type: String, require: true },
    rate: { type: Number, require: true },
    exchangeRateId: { type: Number, require: true },

    operatorId: { type: String, require: true },
    playerId: { type: Number },
});
