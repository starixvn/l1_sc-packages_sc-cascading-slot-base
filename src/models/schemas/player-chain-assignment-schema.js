import { Schema } from "mongoose";

const playerChainAssignmentSchema = new Schema(
    {
        // Player identification
        playerId: {
            type: String,
            required: true,
        },
        playerName: {
            type: String,
            required: true,
        },
        operatorId: {
            type: String,
            required: true,
        },
        gameId: {
            type: String,
            required: true,
        },

        // Chain information
        chainName: {
            type: String,
            required: true,
        },
        chainId: {
            type: Schema.Types.ObjectId,
            required: false, // Optional since we have chainName
        },

        // Progress tracking
        currentBoardIndex: {
            type: Number,
            required: true,
            default: 0,
        },
        totalBoards: {
            type: Number,
            required: true,
        },

        // Financial tracking
        balanceBeforeChain: {
            type: Number,
            required: false,
            default: null,
        },
        balanceAfterChain: {
            type: Number,
            required: false,
            default: null,
        },
        currency: {
            type: String,
            required: true,
        },

        // Timing information
        assignedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        completedAt: {
            type: Date,
            required: false, // Set when chain is finished
            default: null,
        },
        deactivatedAt: {
            type: Date,
            required: false, // Set when chain is deactivated
            default: null,
        },
        lastActivityAt: {
            type: Date,
            required: true,
            default: Date.now,
        },

        // Status and metadata
        status: {
            type: String,
            required: true,
            enum: ["active", "completed", "inactive"],
            default: "active",
        },

        // Game configuration context
        betLevel: {
            type: Number,
            required: false,
        },
        coinValue: {
            type: Number,
            required: false,
        },
        baseBetAmount: {
            type: Number,
            required: true,
        },

        // Outcome tracking
        totalWinAmount: {
            type: Number,
            required: true,
            default: 0,
        },
        totalBetAmount: {
            type: Number,
            required: true,
            default: 0,
        },

        // Additional metadata
        metadata: {
            type: Object,
            required: false,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: "player_chain_assignments",
    }
);

export default playerChainAssignmentSchema;
