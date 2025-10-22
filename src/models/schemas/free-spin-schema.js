import mongoose from "mongoose";

export default new mongoose.Schema({
    id: { type: Number, required: true },
    uid: { type: String, required: true },
    name: { type: String, required: true },
    roundId: { type: Number, required: true },
    bet: { type: Number, required: true },
    total: { type: Number, required: true },
    available: { type: Number, default: 0 },
    time: { type: Date, required: true },
    expiryTime: { type: Date, required: true },
    playerId: { type: String, required: true },
    betLevel: { type: Number, required: true },
    coinValue: { type: Number, require: true },
    betMultiplier: { type: Number, require: true },
    promotionId: { type: String, required: false },
    buyFreeSpinRefRoundId: { type: Number, require: false },
    autoSettle: { type: Boolean, default: false },
});
