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
    },
    {
        timestamps: true,
        collection: "result_chains",
    }
);

export default resultChainSchema;
