/**
 * Test board data for Round Calculator and ChainManager integration tests
 */

export const REGULAR_SPIN_BOARDS = {
    // Regular spin board that triggers free spins (5 symbol 9s)
    FREE_SPIN_TRIGGER: {
        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 9, 9, 9, 9, 9, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4],
        multipliers: [10],
        explodedSymbols: [],
        newSymbols: [],
    },

    // Regular spin board with no wins or free spins
    NO_WINS: {
        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6],
        multipliers: [5],
        explodedSymbols: [],
        newSymbols: [],
    },
};

export const FREE_SPIN_BOARDS = {
    // Free spin board with moderate wins (4 symbol 9s)
    MODERATE_WINS: {
        newBoard: [0, 0, 0, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 9, 9, 0, 4, 0, 0],
        multipliers: [8],
        explodedSymbols: [],
        newSymbols: [],
    },

    // Free spin board that triggers additional free spins (6 symbol 9s)
    ADDITIONAL_TRIGGER: {
        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 9, 9, 9, 9, 9, 9, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4],
        multipliers: [12],
        explodedSymbols: [],
        newSymbols: [],
    },
};

export const CASCADE_BOARDS = {
    // Board with winning combinations for cascades
    WITH_WINS: {
        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 9, 9, 9, 9, 9, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 1, 2, 3, 4, 5],
        multipliers: [10],
        explodedSymbols: [],
        newSymbols: [],
    },

    // Board for cascade continuation
    CASCADE_CONTINUATION: {
        newBoard: [4, 1, 2, 7, 8, 1, 6, 1, 3, 1, 9, 9, 6, 2, 5, 7, 8, 1, 6, 3, 2, 7, 8, 2, 9, 9, 7, 4, 1, 2],
        multipliers: [8],
        explodedSymbols: [0, 0, 0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, 0, 0],
        newSymbols: [4, 1, 2, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1, -1, 5, -1, 8, -1, 6, -1, -1, -1, -1, -1, -1, -1, 7, -1, 1, 2],
    },
};

export const CHAIN_MOCK_DATA = {
    // Player chain with mixed regular and free spin boards
    MIXED_CHAIN: {
        name: "test-chain",
        boards: [
            {
                isFreeSpin: false,
                board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            },
            {
                isFreeSpin: false,
                board: [2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1],
            },
            {
                isFreeSpin: true,
                board: [3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 9, 9, 9, 9, 9, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            },
            {
                remainingFreeSpins: 2,
                board: [4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 9, 9, 9, 9, 4, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1],
            },
            {
                isFreeSpin: false,
                board: [5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4],
            },
        ],
        currentIndex: 0,
        totalBoards: 5,
    },

    // Chain manager configuration
    CHAIN_MANAGER_CONFIG: {
        gameData: { playerChains: {} },
        logService: { logWarning: () => {}, logError: () => {} },
        repositories: [{}, {}],
        appConfigs: { resultChains: { enabled: true } },
    },
};

export const ROUND_MOCK_DATA = {
    // Base round document configuration
    BASE_ROUND: {
        playerId: 1,
        coinValue: 0.1,
        betLevel: 5,
        betMultiplier: 20,
    },

    // Regular spin round
    REGULAR_SPIN: {
        playerId: 1,
        coinValue: 0.1,
        betLevel: 5,
        betMultiplier: 20,
        freeSpin: false,
    },

    // Free spin round
    FREE_SPIN: {
        playerId: 1,
        coinValue: 0.1,
        betLevel: 5,
        betMultiplier: 20,
        freeSpin: true,
    },
};

export const SETTLEMENT_DATA = {
    // Settlement data with cascade sequence
    CASCADE_SEQUENCE: {
        settlementResult: {
            tumbles: [
                {
                    originalBoard: "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0",
                    newBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                    explodedSymbols: [-1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0],
                    newSymbols: [-1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 2, -1, -1, -1, -1, 0, 0, 2, 7, -1],
                    multipliers: [18],
                },
                {
                    originalBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                    newBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                    multipliers: [18],
                },
            ],
        },
    },
};
