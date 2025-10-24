import { Schema } from "mongoose";

const resultChainSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        boardsData: {
            type: Array,
            required: true,
        },
        volatility: {
            type: Number,
            required: false,
            default: 2,
            min: 1,
            max: 5,
        },
    },
    {
        timestamps: true,
        collection: "result_chains",
    }
);

export default resultChainSchema;
