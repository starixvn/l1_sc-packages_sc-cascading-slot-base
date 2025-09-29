import RoundCalculator from "../round-calculator";
import TumbleCalculator from "../tumble-calculator";
import { gameConfigs } from "../../test-data";

const mockBoardGeneratorInstance = {
    generate: jest.fn().mockReturnValue({
        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        multipliers: [1],
    }),
    explodeAndRefill: jest.fn().mockReturnValue({
        newBoard: [2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1],
        explodedSymbols: [1],
        newSymbols: [1],
        multipliers: [1],
    }),
    setRefillSymbols: jest.fn(),
    setDifficulty: jest.fn(),
    updateMultiplierConfig: jest.fn(),
    getMultiplierConfig: jest.fn(),
    getDifficulty: jest.fn(),
};

const boardGenerator = {
    initialize: jest.fn().mockReturnValue(mockBoardGeneratorInstance),
    explodeAndRefill: jest.fn(),
};
const tumbleCalculator = new TumbleCalculator();

function initCalculator() {
    return new RoundCalculator({
        boardGenerator,
        tumbleCalculator,
    });
}

function initRoundDocument({ id = 1, playerId = 1, coinValue = 0.1, betLevel = 5, betMultiplier = 20, freeSpin = false }) {
    return {
        id,
        coinValue,
        betLevel,
        betMultiplier,
        paid: false,
        rate: 1,
        exchangeRateId: 1,
        playerId,
        odds: gameConfigs.cascadingSlotsConfig,
        betwin: 0,
        freeSpin,
        multiplier: 0,
        totalMultiplier: 0,
        save: jest.fn(),
    };
}

describe("RoundCalculator", () => {
    let calculator;

    beforeEach(() => {
        calculator = initCalculator();
        jest.clearAllMocks();
        // Reset the mock return values
        boardGenerator.initialize.mockReturnValue(mockBoardGeneratorInstance);
        mockBoardGeneratorInstance.generate.mockReturnValue({
            newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            multipliers: [1],
        });
        mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue({
            newBoard: [2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1],
            explodedSymbols: [1],
            newSymbols: [1],
            multipliers: [1],
        });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe("processSpinning", () => {
        describe("when processing a normal spin", () => {
            it("should generate initial board and set result", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                const mockGeneratedResult = {
                    newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                    multipliers: [1],
                };
                mockBoardGeneratorInstance.generate.mockReturnValue(mockGeneratedResult);

                // Mock tumbleCalculator to avoid errors
                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                calculator.processSpinning(round);

                // Assert
                expect(round.result).toBe("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30");
            });

            it("should create initial tumble with original board", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                const mockGeneratedResult = {
                    newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                    multipliers: [1],
                };
                mockBoardGeneratorInstance.generate.mockReturnValue(mockGeneratedResult);

                // Mock tumbleCalculator to avoid errors
                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                calculator.processSpinning(round);

                // Assert
                expect(round.settlementResult.tumbles).toHaveLength(1);
                expect(round.settlementResult.tumbles[0].originalBoard).toBe(
                    "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30"
                );
            });

            it("should use pre-generated result when provided", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                const preGeneratedResult = [
                    {
                        newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                        multipliers: [1],
                    },
                ];

                // Mock tumbleCalculator to avoid errors
                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                calculator.processSpinning(round, 0, Number.MAX_VALUE, preGeneratedResult);

                // Assert
                expect(mockBoardGeneratorInstance.generate).not.toHaveBeenCalled();
                expect(round.result).toBe("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30");
            });
        });

        describe("when processing a spin with winning icons", () => {
            describe("when first tumble wins and second tumble has no win", () => {
                it("should continue tumbles until no more wins", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                    const mockGeneratedResult = {
                        newBoard: [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7],
                        multipliers: [2],
                    };
                    const mockRefillResult = {
                        newBoard: [1, 2, 2, 9, 3, 1, 0, 1, 2, 9, 2, 1, 0, 10, 9, 0, 10, 1, 3, 10, 0, 2, 0, 3, 3, 1, 0, 0, 1, 9],
                        multipliers: [1],
                        explodedSymbols: [8],
                        newSymbols: [1, 2, 2, 9, 3, 1, 0, 1, 2, 9, 2, 1, 0, 10, 9, 0, 10, 1, 3, 10, 0, 2, 0, 3, 3, 1, 0, 0, 1, 9],
                    };

                    mockBoardGeneratorInstance.generate.mockReturnValue(mockGeneratedResult);
                    mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue(mockRefillResult);

                    // Mock tumbleCalculator to simulate winning first tumble, no win second tumble
                    const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                    mockCalculate
                        .mockImplementationOnce((tumble) => {
                            // First tumble - winning
                            tumble.win = 100;
                            tumble.icons = { 8: 3 };
                        })
                        .mockImplementationOnce((tumble) => {
                            // Second tumble - no win
                            tumble.win = 0;
                            tumble.icons = {};
                        });

                    // Act
                    calculator.processSpinning(round);

                    // Assert
                    expect(round.settlementResult.tumbles).toHaveLength(2);
                    expect(mockCalculate).toHaveBeenCalledTimes(2);
                });
            });
        });

        describe("when reaching max win during tumbles", () => {
            it("should stop processing when max win is reached", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                const mockGeneratedResult = {
                    newBoard: [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7],
                    multipliers: [2],
                };

                mockBoardGeneratorInstance.generate.mockReturnValue(mockGeneratedResult);

                // Mock explodeAndRefill to avoid errors
                const mockRefillResult = {
                    newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                    multipliers: [1],
                    explodedSymbols: [8],
                    newSymbols: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                };
                mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue(mockRefillResult);

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 1000; // This will trigger max win
                    tumble.icons = { 8: 3 };
                });

                // Act
                calculator.processSpinning(round, 0, 500); // Max win of 500

                // Assert
                expect(round.reachMaxWin).toBe(true);
                expect(round.betwin).toBe(500);
            });
        });
    });

    describe("settleTumble", () => {
        describe("when having winning icons in normal spin", () => {
            it("should calculate betwin correctly", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 100;
                    tumble.icons = { 8: 3 };
                });

                // Act
                calculator.settleTumble(round, 0, 100);

                // Assert
                expect(round.betwin).toEqual(100);
            });

            it("should return true when there is a win", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 100;
                    tumble.icons = { 8: 3 };
                });

                // Act
                const result = calculator.settleTumble(round, 0, 100);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when having no winning icons", () => {
            it("should return false when there is no win", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30",
                            multipliers: [1],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                const result = calculator.settleTumble(round, 0, 100);

                // Assert
                expect(result).toBe(false);
            });

            it("should set betwin to zero when there is no win", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30",
                            multipliers: [1],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                calculator.settleTumble(round, 0, 100);

                // Assert
                expect(round.betwin).toEqual(0);
            });
        });

        describe("when reaching max win", () => {
            describe("when first tumble has normal win and second tumble exceeds max win", () => {
                it("should set reachMaxWin to true", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    round.settlementResult = {
                        tumbles: [
                            {
                                originalBoard: "9,8,8,3,0,8,8,9,8,0,0,10,9,0,8,3,10,0,0,8,8,8,8,3,3,8,0,8,9,0",
                                newBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                multipliers: [1, 1],
                                win: 500,
                            },
                            {
                                originalBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                newBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                multipliers: [1, 15, 1],
                            },
                        ],
                    };

                    const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                    mockCalculate
                        .mockImplementationOnce((tumble) => {
                            // First tumble - normal win
                            tumble.win = 500;
                            tumble.icons = { 8: 3 };
                        })
                        .mockImplementationOnce((tumble) => {
                            // Second tumble - exceeds max win
                            tumble.win = 1000;
                            tumble.icons = { 8: 3 };
                        });

                    // Act
                    calculator.settleTumble(round, 0, 1000);

                    // Assert
                    expect(round.reachMaxWin).toBe(true);
                });

                it("should set betwin to max win per round", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    round.settlementResult = {
                        tumbles: [
                            {
                                originalBoard: "9,8,8,3,0,8,8,9,8,0,0,10,9,0,8,3,10,0,0,8,8,8,8,3,3,8,0,8,9,0",
                                newBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                multipliers: [1, 1],
                                win: 500,
                            },
                            {
                                originalBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                newBoard: "1,2,2,9,3,1,0,1,2,9,2,1,0,10,9,0,10,1,3,10,0,2,0,3,3,1,0,0,1,9",
                                multipliers: [1, 15, 1],
                            },
                        ],
                    };

                    const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                    mockCalculate
                        .mockImplementationOnce((tumble) => {
                            // First tumble - normal win
                            tumble.win = 500;
                            tumble.icons = { 8: 3 };
                        })
                        .mockImplementationOnce((tumble) => {
                            // Second tumble - exceeds max win
                            tumble.win = 1000;
                            tumble.icons = { 8: 3 };
                        });

                    // Act
                    calculator.settleTumble(round, 0, 1000);

                    // Assert
                    expect(round.betwin).toEqual(1000);
                });
            });
        });

        describe("when in free spin mode", () => {
            it("should calculate betwin with total multiplier", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 100;
                    tumble.icons = { 8: 3 };
                });

                // Act
                calculator.settleTumble(round, 2, 100);

                // Assert
                expect(round.totalMultiplier).toEqual(4); // totalMultiplier (2) + multiplier (2)
            });

            it("should calculate actual betwin with total multiplier when there is a win", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 100;
                    tumble.icons = { 8: 3 };
                });

                // Act
                calculator.settleTumble(round, 2, 100);

                // Assert
                expect(round.actualBetwin).toEqual(400); // 100 * 4 (totalMultiplier)
            });

            it("should not apply total multiplier when there is no win", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30",
                            multipliers: [1],
                        },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation((tumble) => {
                    tumble.win = 0;
                    tumble.icons = {};
                });

                // Act
                calculator.settleTumble(round, 2, 100);

                // Assert
                expect(round.totalMultiplier).toEqual(2); // Only the passed totalMultiplier
            });
        });
    });

    describe("updateRound", () => {
        describe("when updating round with multiple tumbles", () => {
            it("should calculate total tumble win correctly", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        { win: 100, multipliers: [2] },
                        { win: 200, multipliers: [3] },
                        { win: 300, multipliers: [1] },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation(() => {});

                // Act
                calculator.settleTumble(round, 0, 1000);

                // Assert
                expect(round.totalTumbleWin).toEqual(600);
            });

            it("should calculate total multiplier correctly", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [
                        { win: 100, multipliers: [2] },
                        { win: 200, multipliers: [3] },
                        { win: 300, multipliers: [1] },
                    ],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation(() => {});

                // Act
                calculator.settleTumble(round, 0, 1000);

                // Assert
                expect(round.multiplier).toEqual(1); // Last tumble multiplier only
            });
        });

        describe("when calculating actual betwin in normal spin", () => {
            it("should apply multiplier when multiplier is greater than 0", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [{ win: 100, multipliers: [2] }],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation(() => {});

                // Act
                calculator.settleTumble(round, 0, 1000);

                // Assert
                expect(round.actualBetwin).toEqual(200); // 100 * 2
            });

            it("should not apply multiplier when multiplier is 0", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                round.settlementResult = {
                    tumbles: [{ win: 100, multipliers: [0] }],
                };

                const mockCalculate = jest.spyOn(tumbleCalculator, "calculate");
                mockCalculate.mockImplementation(() => {});

                // Act
                calculator.settleTumble(round, 0, 1000);

                // Assert
                expect(round.actualBetwin).toEqual(100); // No multiplier applied
            });
        });
    });

    describe("countFreeSpin", () => {
        describe("when there are free spin icons on the board", () => {
            it("should count free spin icons correctly", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.count).toEqual(10); // Symbol 9 appears 10 times
            });

            it("should calculate free spin odds based on initial odds config", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, freeSpin: false });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.odds).toEqual(3); // 8 free spins >= 6, so odds = 3
            });
        });
    });

    describe("processSpinning with chain results", () => {
        // Shared test data factories (DRY principle)
        const createStandardBoard = () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const createWinningBoard = () => [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
        const createEmptySymbolsArray = () => Array(30).fill(-1);
        const createExplodedSymbols = (values) => [...values, ...Array(30 - values.length).fill(-1)];

        const createBasicChainResult = (overrides = {}) => ({
            newBoard: createStandardBoard(),
            multipliers: [1],
            icons: {},
            explodedSymbols: [],
            newSymbols: [],
            ...overrides,
        });

        let round, calculator;

        beforeEach(() => {
            // Common setup for all chain result tests
            round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
            calculator = initCalculator();
        });

        describe("when receiving preGeneratedResult from ChainManager", () => {
            describe("single tumble processing", () => {
                it("should return the round object", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    const result = calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(result).toBe(round);
                });

                it("should create settlement result with tumbles", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(round.settlementResult.tumbles).toBeDefined();
                });

                it("should create exactly one tumble for single result", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(round.settlementResult.tumbles.length).toBe(1);
                });

                it("should set correct original board from chain data", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.originalBoard).toBe("1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10");
                });

                it("should set correct multipliers from chain data", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult({ multipliers: [2] })];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.multipliers).toEqual([2]);
                });

                it("should not assign exploded symbols for single tumble", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.explodedSymbols).toBeUndefined();
                });

                it("should not assign new symbols for single tumble", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.newSymbols).toBeUndefined();
                });
            });

            describe("data consumption", () => {
                it("should consume all preGeneratedResult items", () => {
                    // Arrange
                    const preGeneratedResult = [createBasicChainResult()];

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(preGeneratedResult.length).toBe(0);
                });

                it("should consume multiple chain result items when cascades occur", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult({ newBoard: createWinningBoard(), multipliers: [2] }),
                        createBasicChainResult({ explodedSymbols: [], newSymbols: [] }),
                    ];

                    // Mock tumble calculator to trigger cascade on first tumble only
                    jest.spyOn(calculator, "settleTumble")
                        .mockReturnValueOnce(true) // First tumble has win, triggers cascade
                        .mockReturnValueOnce(false); // Second tumble has no win, stops cascade

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(preGeneratedResult.length).toBe(0);
                });
            });

            describe("format compatibility", () => {
                it("should not throw when accessing explodedSymbols property", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult({
                            explodedSymbols: createExplodedSymbols([1, 2, 3]),
                        }),
                    ];

                    // Act & Assert
                    expect(() => {
                        calculator.processSpinning(round, 0, 1000, preGeneratedResult);
                    }).not.toThrow();
                });

                it("should not throw when accessing newSymbols property", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult({
                            newSymbols: createExplodedSymbols([4, 5, 6]),
                        }),
                    ];

                    // Act & Assert
                    expect(() => {
                        calculator.processSpinning(round, 0, 1000, preGeneratedResult);
                    }).not.toThrow();
                });

                it("should not throw when processing complete chain format", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult({
                            explodedSymbols: createExplodedSymbols([1, 2, 3]),
                            newSymbols: createExplodedSymbols([4, 5, 6]),
                        }),
                    ];

                    // Act & Assert
                    expect(() => {
                        calculator.processSpinning(round, 0, 1000, preGeneratedResult);
                    }).not.toThrow();
                });
            });

            describe("priority over boardGenerator", () => {
                it("should not call boardGenerator when chain data is available", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult(),
                        createBasicChainResult({ explodedSymbols: createExplodedSymbols([99, 88, 77]) }),
                    ];

                    // Mock boardGenerator.explodeAndRefill to track calls
                    const explodeAndRefillSpy = jest.spyOn(boardGenerator, "explodeAndRefill");

                    // Force cascade behavior
                    jest.spyOn(calculator, "settleTumble")
                        .mockReturnValueOnce(true) // First call triggers cascade
                        .mockReturnValueOnce(false); // Second call stops cascade

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(explodeAndRefillSpy).not.toHaveBeenCalled();

                    explodeAndRefillSpy.mockRestore();
                });

                it("should use chain exploded symbols instead of boardGenerator", () => {
                    // Arrange
                    const uniqueExplodedSymbols = createExplodedSymbols([99, 88, 77]);
                    const preGeneratedResult = [createBasicChainResult(), createBasicChainResult({ explodedSymbols: uniqueExplodedSymbols })];

                    jest.spyOn(calculator, "settleTumble").mockReturnValueOnce(true).mockReturnValueOnce(false);

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const firstTumble = round.settlementResult.tumbles[0];
                    expect(firstTumble.explodedSymbols).toEqual(uniqueExplodedSymbols);
                });

                it("should use chain new symbols instead of boardGenerator", () => {
                    // Arrange
                    const uniqueNewSymbols = createExplodedSymbols([11, 22, 33]);
                    const preGeneratedResult = [createBasicChainResult(), createBasicChainResult({ newSymbols: uniqueNewSymbols })];

                    jest.spyOn(calculator, "settleTumble").mockReturnValueOnce(true).mockReturnValueOnce(false);

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    const firstTumble = round.settlementResult.tumbles[0];
                    expect(firstTumble.newSymbols).toEqual(uniqueNewSymbols);
                });

                it("should create correct number of tumbles with chain data", () => {
                    // Arrange
                    const preGeneratedResult = [
                        createBasicChainResult(),
                        createBasicChainResult({ explodedSymbols: createExplodedSymbols([99, 88, 77]) }),
                    ];

                    jest.spyOn(calculator, "settleTumble").mockReturnValueOnce(true).mockReturnValueOnce(false);

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(round.settlementResult.tumbles.length).toBe(2);
                });
            });

            it("should calculate free spin odds based on additional odds config for free spin mode", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, freeSpin: true });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.odds).toEqual(2); // 8 free spins >= 6, so odds = 2 (additional odds)
            });

            it("should calculate free spin win amount correctly", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.win).toEqual(1); // 10 free spins falls in range 12-30 with odds 1, so 1 * 0.1 * 5 = 0.5, but it's rounded to 1
            });

            it("should add free spin win to actual betwin", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.actualBetwin = 100;
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.actualBetwin).toEqual(101); // 100 + 1 (free spin win)
            });
        });
        describe("processSpinning with corrected tease data", () => {
            beforeEach(() => {
                jest.clearAllMocks();
            });

            describe("Single tumble scenario from corrected data", () => {
                it("should process board with no wins correctly", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    const calculator = initCalculator();

                    // Mock tumbleCalculator to simulate no wins
                    const mockCalculate = jest.spyOn(calculator.tumbleCalculator, "calculate");
                    mockCalculate.mockImplementation((tumble) => {
                        tumble.win = 0;
                        tumble.icons = {};
                    });

                    // Board 2 from corrected tease data (no wins)
                    const preGeneratedResult = [
                        {
                            newBoard: [0, 6, 4, 3, 3, 0, 5, 2, 2, 2, 2, 3, 0, 2, 2, 1, 1, 3, 0, 8, 0, 1, 2, 4, 1, 5, 1, 1, 1, 6],
                            multipliers: [],
                            explodedSymbols: [],
                            newSymbols: [],
                        },
                    ];

                    // Act
                    const result = calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(result).toBe(round);
                    expect(preGeneratedResult.length).toBe(0); // Consumed

                    // Should have exactly 1 tumble
                    expect(round.settlementResult.tumbles.length).toBe(1);

                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.originalBoard).toBe("0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6");
                    expect(tumble.newBoard).toBe("0,6,4,3,3,0,5,2,2,2,2,3,0,2,2,1,1,3,0,8,0,1,2,4,1,5,1,1,1,6");
                    expect(tumble.multipliers).toEqual([]);
                    expect(tumble.win).toBe(0);
                    expect(Object.keys(tumble.icons)).toHaveLength(0);
                    expect(tumble.explodedSymbols).toBeUndefined();
                    expect(tumble.newSymbols).toBeUndefined();

                    mockCalculate.mockRestore();
                });
            });

            describe("Two tumbles scenario from corrected data", () => {
                it("should process board 1 with 9 zeros winning combination", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    const calculator = initCalculator();

                    // Mock tumbleCalculator to simulate wins on first tumble, no wins on second
                    const mockCalculate = jest.spyOn(calculator.tumbleCalculator, "calculate");
                    let callCount = 0;
                    mockCalculate.mockImplementation((tumble) => {
                        callCount++;
                        if (callCount === 1) {
                            // First tumble has wins
                            tumble.win = 100;
                            tumble.icons = { 0: { count: 9, odds: 5 } };
                        } else {
                            // Second tumble has no wins
                            tumble.win = 0;
                            tumble.icons = {};
                        }
                    });

                    // Board 1 from corrected tease data (9 zeros = 5x odds)
                    const preGeneratedResult = [
                        {
                            newBoard: [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 0, 0, 0, 4, 0, 0],
                            multipliers: [18],
                            explodedSymbols: [],
                            newSymbols: [],
                        },
                        {
                            newBoard: [6, 10, 5, 7, 8, 1, 1, 6, 1, 1, 1, 9, 9, 6, 2, 1, 2, 7, 1, 3, 2, 2, 7, 8, 2, 0, 0, 2, 7, 4],
                            multipliers: [18],
                            explodedSymbols: [
                                -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0,
                            ],
                            newSymbols: [
                                -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 2, -1, -1, -1, -1, 0, 0, 2, 7, -1,
                            ],
                        },
                    ];

                    // Act
                    const result = calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(result).toBe(round);
                    expect(preGeneratedResult.length).toBe(0); // All consumed

                    mockCalculate.mockRestore();

                    // Should have exactly 2 tumbles
                    expect(round.settlementResult.tumbles.length).toBe(2);

                    // First tumble verification (should have winning 0's)
                    const firstTumble = round.settlementResult.tumbles[0];
                    expect(firstTumble.originalBoard).toBe("6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0");
                    expect(firstTumble.newBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(firstTumble.explodedSymbols).toEqual([
                        -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0,
                    ]);
                    expect(firstTumble.newSymbols).toEqual([
                        -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 2, -1, -1, -1, -1, 0, 0, 2, 7, -1,
                    ]);
                    expect(firstTumble.multipliers).toEqual([18]);
                    expect(firstTumble.win).toBeGreaterThan(0); // Should have wins from 9 zeros
                    expect(firstTumble.icons["0"]).toBeDefined();
                    expect(firstTumble.icons["0"].count).toBe(9);

                    // Second tumble verification (should have no wins)
                    const secondTumble = round.settlementResult.tumbles[1];
                    expect(secondTumble.originalBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(secondTumble.newBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(secondTumble.explodedSymbols).toBeUndefined();
                    expect(secondTumble.newSymbols).toBeUndefined();
                    expect(secondTumble.win).toBe(0);
                    expect(Object.keys(secondTumble.icons)).toHaveLength(0);
                });

                it("should process board 8 with 9 zeros winning combination", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    const calculator = initCalculator();

                    // Board 8 from corrected tease data (9 zeros = 5x odds)
                    const preGeneratedResult = [
                        {
                            newBoard: [0, 9, 1, 4, 1, 0, 0, 0, 7, 0, 3, 1, 4, 6, 3, 9, 2, 0, 7, 3, 6, 0, 0, 3, 6, 3, 0, 6, 9, 1],
                            multipliers: [],
                            explodedSymbols: [],
                            newSymbols: [],
                        },
                        {
                            newBoard: [2, 9, 1, 4, 1, 1, 6, 5, 0, 7, 3, 1, 4, 6, 3, 4, 9, 2, 7, 3, 0, 1, 6, 3, 6, 2, 3, 6, 9, 1],
                            multipliers: [],
                            explodedSymbols: [
                                0, -1, -1, -1, -1, 0, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1,
                            ],
                            newSymbols: [
                                2, -1, -1, -1, -1, 1, 6, 5, 0, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, 0, 1, -1, -1, -1, 2, -1, -1, -1, -1,
                            ],
                        },
                    ];

                    // Act
                    const result = calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(result).toBe(round);
                    expect(preGeneratedResult.length).toBe(0); // All consumed

                    // Should have exactly 2 tumbles
                    expect(round.settlementResult.tumbles.length).toBe(2);

                    // First tumble verification (should have winning 0's)
                    const firstTumble = round.settlementResult.tumbles[0];
                    expect(firstTumble.originalBoard).toBe("0,9,1,4,1,0,0,0,7,0,3,1,4,6,3,9,2,0,7,3,6,0,0,3,6,3,0,6,9,1");
                    expect(firstTumble.newBoard).toBe("2,9,1,4,1,1,6,5,0,7,3,1,4,6,3,4,9,2,7,3,0,1,6,3,6,2,3,6,9,1");
                    expect(firstTumble.explodedSymbols).toEqual([
                        0, -1, -1, -1, -1, 0, 0, 0, -1, 0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, 0, 0, -1, -1, -1, 0, -1, -1, -1,
                    ]);
                    expect(firstTumble.newSymbols).toEqual([
                        2, -1, -1, -1, -1, 1, 6, 5, 0, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, 0, 1, -1, -1, -1, 2, -1, -1, -1, -1,
                    ]);
                    expect(firstTumble.multipliers).toEqual([]);
                    expect(firstTumble.win).toBeGreaterThan(0); // Should have wins from 9 zeros
                    expect(firstTumble.icons["0"]).toBeDefined();
                    expect(firstTumble.icons["0"].count).toBe(9);

                    // Second tumble verification (should have no wins)
                    const secondTumble = round.settlementResult.tumbles[1];
                    expect(secondTumble.originalBoard).toBe("2,9,1,4,1,1,6,5,0,7,3,1,4,6,3,4,9,2,7,3,0,1,6,3,6,2,3,6,9,1");
                    expect(secondTumble.newBoard).toBe("2,9,1,4,1,1,6,5,0,7,3,1,4,6,3,4,9,2,7,3,0,1,6,3,6,2,3,6,9,1");
                    expect(secondTumble.explodedSymbols).toBeUndefined();
                    expect(secondTumble.newSymbols).toBeUndefined();
                    expect(secondTumble.win).toBe(0);
                    expect(Object.keys(secondTumble.icons)).toHaveLength(0);
                });
            });

            describe("preGeneratedResult format validation", () => {
                it("should correctly consume preGeneratedResult items in order", () => {
                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    const calculator = initCalculator();

                    // Track original array length
                    const preGeneratedResult = [
                        {
                            newBoard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                            multipliers: [1],
                            explodedSymbols: [],
                            newSymbols: [],
                        },
                    ];

                    const originalLength = preGeneratedResult.length;

                    // Act
                    calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert
                    expect(preGeneratedResult.length).toBe(0); // All items consumed by shift()
                    expect(round.settlementResult.tumbles.length).toBe(1);

                    const tumble = round.settlementResult.tumbles[0];
                    expect(tumble.originalBoard).toBe("1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10");
                });
            });

            describe("ChainManager integration with corrected data", () => {
                it("should produce correct preGeneratedResult format for processSpinning", () => {
                    // Simulate what ChainManager.convertChainBoardToResult would produce
                    // This uses the fixed version of the method
                    const mockChainBoard = {
                        board: [6, 10, 5, 7, 8, 1, 6, 1, 0, 1, 9, 9, 6, 2, 0, 7, 0, 1, 0, 3, 2, 7, 8, 2, 0, 0, 0, 4, 0, 0],
                        multipliers: [18],
                        settlementResult: {
                            tumbles: [
                                {
                                    originalBoard: "6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0",
                                    newBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                                    explodedSymbols: [
                                        -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0,
                                    ],
                                    newSymbols: [
                                        -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 2, -1, -1, -1, -1, 0, 0, 2, 7, -1,
                                    ],
                                    multipliers: [18],
                                },
                                {
                                    originalBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                                    newBoard: "6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4",
                                    multipliers: [18],
                                },
                            ],
                        },
                    };

                    // Apply the fixed ChainManager logic
                    const convertChainBoardToResult = (chainBoard) => {
                        if (chainBoard.settlementResult && chainBoard.settlementResult.tumbles) {
                            const tumbles = chainBoard.settlementResult.tumbles;
                            const result = [];

                            for (let i = 0; i < tumbles.length; i++) {
                                const tumble = tumbles[i];
                                const preGeneratedItem = {
                                    newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
                                    multipliers: tumble.multipliers || chainBoard.multipliers || [],
                                    explodedSymbols: [],
                                    newSymbols: [],
                                };

                                // Settlement data from PREVIOUS tumble goes to current preGeneratedResult item
                                if (i > 0) {
                                    const previousTumble = tumbles[i - 1];
                                    preGeneratedItem.explodedSymbols = previousTumble.explodedSymbols || [];
                                    preGeneratedItem.newSymbols = previousTumble.newSymbols || [];
                                }

                                result.push(preGeneratedItem);
                            }

                            return result;
                        }
                        return [];
                    };

                    const preGeneratedResult = convertChainBoardToResult(mockChainBoard);

                    // Arrange
                    const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                    const calculator = initCalculator();

                    // Act
                    const result = calculator.processSpinning(round, 0, 1000, preGeneratedResult);

                    // Assert - Should match the corrected JSON structure exactly
                    expect(result).toBe(round);
                    expect(round.settlementResult.tumbles.length).toBe(2);

                    // First tumble should match corrected JSON
                    const firstTumble = round.settlementResult.tumbles[0];
                    expect(firstTumble.originalBoard).toBe("6,10,5,7,8,1,6,1,0,1,9,9,6,2,0,7,0,1,0,3,2,7,8,2,0,0,0,4,0,0");
                    expect(firstTumble.newBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(firstTumble.explodedSymbols).toEqual([
                        -1, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 0, -1, 0, -1, 0, -1, -1, -1, -1, -1, 0, 0, 0, -1, 0, 0,
                    ]);
                    expect(firstTumble.newSymbols).toEqual([
                        -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, -1, -1, 1, 2, -1, -1, -1, 2, -1, -1, -1, -1, 0, 0, 2, 7, -1,
                    ]);
                    expect(firstTumble.win).toBeGreaterThan(0);
                    expect(firstTumble.icons["0"]).toBeDefined();

                    // Second tumble should match corrected JSON
                    const secondTumble = round.settlementResult.tumbles[1];
                    expect(secondTumble.originalBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(secondTumble.newBoard).toBe("6,10,5,7,8,1,1,6,1,1,1,9,9,6,2,1,2,7,1,3,2,2,7,8,2,0,0,2,7,4");
                    expect(secondTumble.explodedSymbols).toBeUndefined();
                    expect(secondTumble.newSymbols).toBeUndefined();
                    expect(secondTumble.win).toBe(0);
                    expect(Object.keys(secondTumble.icons)).toHaveLength(0);
                });
            });
        });
    });
});
