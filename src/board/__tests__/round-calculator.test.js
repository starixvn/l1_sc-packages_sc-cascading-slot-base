import { stub } from "jest-micro-auto-stub";
import CascadingBoardGenerator from "../cascading-board-generator";
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

        describe("when there are no free spin icons on the board", () => {
            it("should set free spin count to zero", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,0",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.count).toEqual(0);
            });

            it("should set free spin odds to zero", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,0",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round);

                // Assert
                expect(round.settlementResult.freeSpins.odds).toEqual(0);
            });
        });

        describe("when reaching max win during free spin calculation", () => {
            it("should set reachMaxWin to true", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.actualBetwin = 999;
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round, 1000);

                // Assert
                expect(round.reachMaxWin).toBe(true);
            });

            it("should cap betwin at max win per round", () => {
                // Arrange
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5 });
                round.actualBetwin = 999;
                round.settlementResult = {
                    tumbles: [
                        {
                            originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                            multipliers: [2],
                        },
                    ],
                };

                // Act
                calculator.countFreeSpin(round, 1000);

                // Assert
                expect(round.betwin).toEqual(1000);
            });
        });
    });
});
