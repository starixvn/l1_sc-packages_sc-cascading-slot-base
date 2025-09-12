import mongoose from "mongoose";

const Schema = new mongoose.Schema({
    ssoToken: { type: String },
    sessionId: { type: String, unique: true, index: true },
    siteId: { type: String },
    userId: { type: String },
    username: { type: String },
    owSeq: { type: String },
    memberId: { type: String },
    ssoTime: { type: Date },
    recheckInTime: { type: Date, required: true },
    ip: { type: String },
    browserUserAgent: { type: String },
    language: { type: String },
    currencyCode: { type: String },
    currencyName: { type: String },
    currencyGroupId: { type: String },
    isTestCurrency: { type: Boolean },
    multiplier: { type: Number },
    partnerId: { type: String },
    memberName: { type: String },
    siteName: { type: String },
    system: { type: Number },

    operatorId: { type: String },
    playerId: { type: String },
    playerName: { type: String },
    operatorToken: { type: String },
});

export default mongoose.model("UserSessions", Schema);
