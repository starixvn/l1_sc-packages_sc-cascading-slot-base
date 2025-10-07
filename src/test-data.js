const gameConfigs = {
    cascadingSlotsConfig: {
        mode: 1,
        oddsByCounts: {
            0: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            1: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            2: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            3: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            4: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            5: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            6: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 1 },
                { from: 12, to: 30, odds: 1 },
            ],
            7: [
                { from: 8, to: 9, odds: 2 },
                { from: 10, to: 11, odds: 2 },
                { from: 12, to: 30, odds: 2 },
            ],
            8: [
                { from: 8, to: 9, odds: 1.5 },
                { from: 10, to: 11, odds: 2 },
                { from: 12, to: 30, odds: 2.5 },
            ],
            9: [
                { from: 8, to: 9, odds: 1 },
                { from: 10, to: 11, odds: 2 },
                { from: 12, to: 30, odds: 3 },
            ],
        },
        freeSpins: {
            initialOdds: [
                { count: 4, odds: 1 },
                { count: 5, odds: 2 },
                { count: 6, odds: 3 },
            ],
            additionalOdds: [
                { count: 5, odds: 1 },
                { count: 6, odds: 2 },
            ],
        },
        multiplierBonus: {
            symbol: 10,
            min: 2,
            max: 25,
        },
        resultChains: {
            enabled: false,
            reload: false,
        },
        bigWinRatio: 10,
        megaWinRatio: 25,
        superWinRatio: 50,

    },
};

const definition = {
    id: 47,
    name: "cascadinggame",
};

export { gameConfigs, definition };
