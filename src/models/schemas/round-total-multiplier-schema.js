import mongoose from "mongoose";

export default new mongoose.Schema(
    {
        time: { type: Date },
        roundId: { type: String },
        prevTotalMultiplier: { type: Number, default: 0 },
        totalMultiplier: { type: Number, default: 0 },
        multiplier: { type: Number, default: 0 },
    },
    { _id: false }
);
