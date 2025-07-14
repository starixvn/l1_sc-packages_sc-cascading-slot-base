import mongoose from "mongoose";
import RoundTotalMultiplierSchema from "./round-total-multiplier-schema";

export default new mongoose.Schema({
    uid: { type: String },
    playerId: { type: String },
    name: { type: String, required: true },
    ended: { type: Boolean, default: false },
    time: { type: Date },
    endTime: { type: Date },
    rounds: { type: [RoundTotalMultiplierSchema] },
});
