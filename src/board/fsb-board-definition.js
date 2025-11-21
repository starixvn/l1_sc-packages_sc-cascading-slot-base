const multiplierWeights = {
    2: 60,
    3: 40,
    4: 18,
    5: 17,
    6: 16,
    7: 15,
    8: 14,
    9: 13,
    10: 12,
    11: 11,
    12: 10,
    13: 10,
    14: 8,
    15: 7,
    16: 6,
    17: 5,
    18: 4,
    19: 3,
    20: 2,
    21: 1,
};
const symbolWeights = {
    1: 130,
    2: 108,
    0: 97,
    3: 81,
    4: 65,
    5: 54,
    6: 43,
    7: 34,
    8: 17,
    9: 11,
    10: 4,
};

export default {
    2: {
        freeSpin: {
            multiplierWeights,
            symbolWeights,
        },
    },
    5: {
        freeSpin: {
            multiplierWeights,
            symbolWeights,
        },
    },
};
