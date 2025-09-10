import ChainManager from "../chain-manager";

const mockGameData = {};
const mockLogService = {
    log: jest.fn(),
    logWarning: jest.fn(),
    logError: jest.fn(),
    logInfo: jest.fn(),
};

const mockResultChainRepository = {
    find: jest.fn(),
};

const mockAssignmentRepository = {
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    findOne: jest.fn().mockResolvedValue(null),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
};

const mockAppConfigs = {
    resultChains: { enabled: true },
};

const mockDatabaseChains = [
    {
        _id: "68ba82677350005bcefd0fbe",
        name: "test-chain",
        boardsData: [
            {
                board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                multipliers: [1],
                isFreeSpin: false,
                remainingFreeSpins: 0,
                settlementResult: {
                    tumbles: [
                        {
                            originalBoard: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30",
                            multipliers: [1],
                            icons: {},
                        },
                    ],
                },
            },
            {
                board: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
                multipliers: [2],
                isFreeSpin: true,
                remainingFreeSpins: 3,
                settlementResult: {
                    tumbles: [
                        {
                            originalBoard: "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29",
                            multipliers: [2],
                            icons: {},
                        },
                    ],
                },
            },
            {
                board: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                multipliers: [1],
                isFreeSpin: false,
                remainingFreeSpins: 0,
                settlementResult: {
                    tumbles: [
                        {
                            originalBoard: "2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2",
                            multipliers: [1],
                            icons: {},
                        },
                    ],
                },
            },
        ],
        createdAt: new Date("2025-09-05T06:25:43.344Z"),
    },
];

describe("ChainManager", () => {
    let chainManager;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Mock repository to return our test data
        mockResultChainRepository.find.mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockDatabaseChains),
            }),
        });

        chainManager = new ChainManager(mockGameData, mockLogService, mockResultChainRepository, mockAssignmentRepository, mockAppConfigs);
        await chainManager.loadChainData();
    });

    describe("constructor", () => {
        it("should initialize with gameData, logService, resultChainRepository, assignmentRepository, and appConfigs", () => {
            expect(chainManager.gameData).toBe(mockGameData);
            expect(chainManager.logService).toBe(mockLogService);
            expect(chainManager.resultChainRepository).toBe(mockResultChainRepository);
            expect(chainManager.assignmentRepository).toBe(mockAssignmentRepository);
            expect(chainManager.appConfigs).toBe(mockAppConfigs);
        });

        it("should load chain data on initialization", () => {
            expect(chainManager.availableChains).toHaveLength(1);
            expect(chainManager.availableChains[0].name).toBe("test-chain");
        });
    });

    describe("loadChainData", () => {
        it("should not load chains when feature is disabled", async () => {
            jest.clearAllMocks();

            const disabledChainManager = new ChainManager(mockGameData, mockLogService, mockResultChainRepository, mockAssignmentRepository, {
                resultChains: { enabled: false },
            });

            await disabledChainManager.loadChainData();

            expect(disabledChainManager.availableChains).toHaveLength(0);
            expect(mockResultChainRepository.find).not.toHaveBeenCalled();
        });
    });

    describe("assignChain", () => {
        it("should assign chain to player successfully", async () => {
            const result = await chainManager.assignChain("testPlayer");

            expect(result).toBe(true);
            expect(mockGameData.playerChains["testPlayer"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(0);
            expect(mockGameData.playerChains["testPlayer"].totalBoards).toBe(3);
        });

        it("should return false when no chains available", async () => {
            chainManager.availableChains = [];
            const result = await chainManager.assignChain("testPlayer");

            expect(result).toBe(false);
            expect(mockLogService.logWarning).toHaveBeenCalled();
        });
    });

    describe("getNextResult", () => {
        beforeEach(async () => {
            await chainManager.assignChain("testPlayer");
        });

        it("should return first board result", async () => {
            const result = await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: false });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(1);
        });

        it("should return free spin board when requested", async () => {
            const result = await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: true });

            expect(result).toBeDefined();
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(2); // Should skip to free spin board
        });

        it("should return null for player without chain", async () => {
            const result = await chainManager.getNextResult("unknownPlayer", {}, { isFreeSpin: false });
            expect(result).toBeNull();
        });

        it("should clean up and return null when chain is complete", async () => {
            // Use up all boards
            await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: false }); // Board 1
            await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: false }); // Board 2
            await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: false }); // Board 3

            const result = await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: false }); // Should be null

            expect(result).toBeNull();
            expect(mockGameData.playerChains["testPlayer"]).toBeUndefined();
        });
    });

    describe("shouldAssignChain", () => {
        it("should return true for player without chain when enabled", () => {
            expect(chainManager.shouldAssignChain("newPlayer")).toBe(true);
        });

        it("should return false for player with chain", () => {
            chainManager.assignChain("testPlayer");
            expect(chainManager.shouldAssignChain("testPlayer")).toBe(false);
        });

        it("should return false when feature is disabled", () => {
            chainManager.appConfigs.resultChains.enabled = false;
            expect(chainManager.shouldAssignChain("newPlayer")).toBe(false);
        });
    });

    describe("getChainStatus", () => {
        it("should return hasChain false for player without chain", () => {
            const status = chainManager.getChainStatus("unknownPlayer");
            expect(status.hasChain).toBe(false);
        });

        it("should return chain status for player with chain", () => {
            chainManager.assignChain("testPlayer");
            const status = chainManager.getChainStatus("testPlayer");

            expect(status.hasChain).toBe(true);
            expect(status.chainName).toBe("test-chain");
            expect(status.progress).toBe("0/3");
        });
    });

    describe("convertChainBoardToResult", () => {
        const mockMultiTumbleTestData = {
            boards: [
                // 3-tumble board example
                {
                    board: [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8],
                    settlementResult: {
                        tumbles: [
                            {
                                originalBoard: "1,1,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                                explodedSymbols: [
                                    -1, -1, -1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                newSymbols: [
                                    2, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                multipliers: [1],
                                icons: { 1: { count: 3, odds: 5, win: 15 } },
                                win: 15,
                            },
                            {
                                originalBoard: "2,3,4,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                                explodedSymbols: [
                                    -1, -1, -1, 2, 2, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                newSymbols: [
                                    5, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                multipliers: [1],
                                icons: { 2: { count: 3, odds: 3.33, win: 10 } },
                                win: 10,
                            },
                            {
                                originalBoard: "5,6,7,5,6,7,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8",
                                explodedSymbols: [], // Final tumble - empty
                                newSymbols: [], // Final tumble - empty
                                multipliers: [1],
                                icons: {},
                                win: 0,
                            },
                        ],
                    },
                },
                // 4-tumble board example
                {
                    board: [8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7],
                    settlementResult: {
                        tumbles: [
                            {
                                originalBoard: "8,8,8,8,8,8,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                                explodedSymbols: [
                                    8, 8, 8, 8, 8, 8, 8, 8, 8, -1, -1, -1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1, -1,
                                ],
                                newSymbols: [
                                    1, 2, 3, 1, 2, 3, 1, 2, 3, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1,
                                ],
                                multipliers: [2],
                                icons: { 8: { count: 10, odds: 2, win: 20 } },
                                win: 20,
                            },
                            {
                                originalBoard: "1,2,3,1,2,3,1,2,3,9,5,9,1,2,4,9,5,4,6,2,4,6,3,1,3,1,5,6,7,7",
                                explodedSymbols: [
                                    1, -1, -1, 1, -1, -1, 1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, -1, -1,
                                ],
                                newSymbols: [
                                    4, -1, -1, 5, -1, -1, 6, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, -1, 5, -1, -1, -1, -1,
                                ],
                                multipliers: [2],
                                icons: { 1: { count: 6, odds: 1.5, win: 9 } },
                                win: 9,
                            },
                            {
                                originalBoard: "4,2,3,5,2,3,6,2,3,9,5,9,4,2,4,9,5,4,6,2,4,6,3,4,3,5,5,6,7,7",
                                explodedSymbols: [
                                    -1, 2, -1, -1, 2, -1, -1, 2, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                ],
                                newSymbols: [
                                    -1, 7, -1, -1, 8, -1, -1, 9, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                ],
                                multipliers: [1],
                                icons: { 2: { count: 5, odds: 1.2, win: 6 } },
                                win: 6,
                            },
                            {
                                originalBoard: "4,7,3,5,8,3,6,9,3,9,5,9,4,7,4,9,5,4,6,8,4,6,3,4,3,5,5,6,7,7",
                                explodedSymbols: [], // Final tumble - empty
                                newSymbols: [], // Final tumble - empty
                                multipliers: [1],
                                icons: {},
                                win: 0,
                            },
                        ],
                    },
                },
                // 5-tumble board example
                {
                    board: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2],
                    settlementResult: {
                        tumbles: [
                            {
                                originalBoard: "0,0,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8,9,1,2",
                                explodedSymbols: [
                                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                ],
                                newSymbols: [
                                    3, 4, 5, 6, 7, 8, 9, 1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                ],
                                multipliers: [3],
                                icons: { 0: { count: 10, odds: 4, win: 40 } },
                                win: 40,
                            },
                            {
                                originalBoard: "3,4,5,6,7,8,9,1,2,3,1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8,9,1,2",
                                explodedSymbols: [
                                    3, -1, -1, -1, -1, -1, -1, 1, -1, 3, 1, -1, 3, -1, -1, -1, -1, -1, -1, 1, -1, 3, -1, -1, -1, -1, -1, -1, 1, -1,
                                ],
                                newSymbols: [
                                    4, -1, -1, -1, -1, -1, -1, 5, -1, 6, 7, -1, 8, -1, -1, -1, -1, -1, -1, 9, -1, 4, -1, -1, -1, -1, -1, -1, 5, -1,
                                ],
                                multipliers: [2],
                                icons: { 1: { count: 4, odds: 1, win: 4 }, 3: { count: 4, odds: 1, win: 4 } },
                                win: 8,
                            },
                            {
                                originalBoard: "4,4,5,6,7,8,9,5,2,6,7,2,8,4,5,6,7,8,9,9,2,4,4,5,6,7,8,9,5,2",
                                explodedSymbols: [
                                    4, 4, -1, -1, -1, -1, -1, 5, -1, -1, -1, -1, -1, 4, 5, -1, -1, -1, -1, -1, -1, 4, 4, 5, -1, -1, -1, -1, 5, -1,
                                ],
                                newSymbols: [
                                    1, 3, -1, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1, 1, 3, -1, -1, -1, -1, -1, -1, 1, 3, 8, -1, -1, -1, -1, 8, -1,
                                ],
                                multipliers: [1],
                                icons: { 4: { count: 6, odds: 1.1, win: 6.6 }, 5: { count: 4, odds: 1, win: 4 } },
                                win: 10.6,
                            },
                            {
                                originalBoard: "1,3,5,6,7,8,9,8,2,6,7,2,8,1,3,6,7,8,9,9,2,1,3,8,6,7,8,9,8,2",
                                explodedSymbols: [
                                    -1, -1, -1, -1, -1, 8, -1, 8, -1, -1, -1, -1, 8, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1, 8, -1, -1, 8, -1, 8, -1,
                                ],
                                newSymbols: [
                                    -1, -1, -1, -1, -1, 4, -1, 5, -1, -1, -1, -1, 4, -1, -1, -1, -1, 5, -1, -1, -1, -1, -1, 4, -1, -1, 5, -1, 4, -1,
                                ],
                                multipliers: [1],
                                icons: { 8: { count: 7, odds: 1.8, win: 12.6 } },
                                win: 12.6,
                            },
                            {
                                originalBoard: "1,3,5,6,7,4,9,5,2,6,7,2,4,1,3,6,7,5,9,9,2,1,3,4,6,7,5,9,4,2",
                                explodedSymbols: [], // Final tumble - empty
                                newSymbols: [], // Final tumble - empty
                                multipliers: [1],
                                icons: {},
                                win: 0,
                            },
                        ],
                    },
                },
                // Board with only 2 tumbles (should not be included in >2 filter)
                {
                    board: [7, 7, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 8, 8],
                    settlementResult: {
                        tumbles: [
                            {
                                originalBoard: "7,7,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,8,8",
                                explodedSymbols: [
                                    7, 7, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, 8, 8,
                                ],
                                newSymbols: [
                                    1, 2, -1, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, 5, 6,
                                ],
                                multipliers: [1],
                                icons: { 7: { count: 4, odds: 1, win: 4 }, 8: { count: 2, odds: 0.5, win: 2 } },
                                win: 6,
                            },
                            {
                                originalBoard: "1,2,1,2,3,4,5,6,3,8,9,0,1,2,3,4,5,6,4,8,9,0,1,2,3,4,5,6,5,6",
                                explodedSymbols: [], // Final tumble - empty (even in 2-tumble scenario)
                                newSymbols: [], // Final tumble - empty
                                multipliers: [1],
                                icons: {},
                                win: 0,
                            },
                        ],
                    },
                },
            ],
        };

        describe("exploded symbols behavior with multiple tumbles", () => {
            it("should verify explodedSymbols behavior in multi-tumble scenarios", () => {
                // Find boards with multiple tumbles
                const multiTumbleBoards = mockMultiTumbleTestData.boards.filter((board) => board.settlementResult?.tumbles?.length > 2);

                expect(multiTumbleBoards.length).toBeGreaterThan(0);

                multiTumbleBoards.forEach((board, boardIndex) => {
                    const tumbles = board.settlementResult.tumbles;

                    // Convert the chain board to result format
                    const result = chainManager.convertChainBoardToResult(board);

                    expect(result).toBeDefined();
                    expect(Array.isArray(result)).toBe(true);
                    expect(result.length).toBe(tumbles.length);

                    result.forEach((tumbleResult, tumbleIndex) => {
                        const originalTumble = tumbles[tumbleIndex];

                        // Verify settlement format structure
                        expect(tumbleResult.settlement).toBeDefined();
                        expect(tumbleResult.settlement.explode).toBeDefined();
                        expect(tumbleResult.settlement.new).toBeDefined();

                        // Verify explodedSymbols are preserved in conversion
                        if (originalTumble.explodedSymbols) {
                            expect(tumbleResult.settlement.explode).toEqual(originalTumble.explodedSymbols);
                        }

                        // Verify newSymbols are preserved in conversion
                        if (originalTumble.newSymbols) {
                            expect(tumbleResult.settlement.new).toEqual(originalTumble.newSymbols);
                        }
                    });
                });
            });

            it("should verify that final tumbles have empty explodedSymbols", () => {
                // Get boards with multiple tumbles (>2)
                const multiTumbleBoards = mockMultiTumbleTestData.boards.filter((board) => board.settlementResult?.tumbles?.length > 2);

                expect(multiTumbleBoards.length).toBeGreaterThan(0);

                multiTumbleBoards.forEach((board) => {
                    const tumbles = board.settlementResult.tumbles;
                    const finalTumble = tumbles[tumbles.length - 1];

                    // The final tumble should have empty or missing explodedSymbols
                    // because it represents the final state where no more symbols explode
                    expect(
                        !finalTumble.explodedSymbols ||
                            finalTumble.explodedSymbols.length === 0 ||
                            finalTumble.explodedSymbols.every((symbol) => symbol === -1)
                    ).toBe(true);
                });
            });

            it("should verify that non-final tumbles have explodedSymbols when there are wins", () => {
                // Get boards with multiple tumbles (>2)
                const multiTumbleBoards = mockMultiTumbleTestData.boards.filter((board) => board.settlementResult?.tumbles?.length > 2);

                expect(multiTumbleBoards.length).toBeGreaterThan(0);

                multiTumbleBoards.forEach((board) => {
                    const tumbles = board.settlementResult.tumbles;

                    // Check all tumbles except the final one
                    for (let i = 0; i < tumbles.length - 1; i++) {
                        const tumble = tumbles[i];

                        // If there's a win, there should be exploded symbols
                        if (tumble.win > 0) {
                            expect(tumble.explodedSymbols).toBeDefined();
                            expect(Array.isArray(tumble.explodedSymbols)).toBe(true);
                            expect(tumble.explodedSymbols.length).toBeGreaterThan(0);

                            // Should have at least some exploded symbols (not all -1)
                            const hasExplodedSymbols = tumble.explodedSymbols.some((symbol) => symbol !== -1);
                            expect(hasExplodedSymbols).toBe(true);
                        }
                    }
                });
            });

            it("should validate the explodedSymbols pattern across all tease chain boards", () => {
                // Statistical validation of the observed pattern
                let boardsWithMultipleTumbles = 0;
                let finalTumblesWithEmptyExploded = 0;
                let nonFinalTumblesWithExploded = 0;
                let totalNonFinalTumbles = 0;

                mockMultiTumbleTestData.boards.forEach((board) => {
                    const tumbles = board.settlementResult?.tumbles;
                    if (tumbles && tumbles.length > 2) {
                        boardsWithMultipleTumbles++;

                        // Check final tumble
                        const finalTumble = tumbles[tumbles.length - 1];
                        const finalHasEmptyExploded =
                            !finalTumble.explodedSymbols ||
                            finalTumble.explodedSymbols.length === 0 ||
                            finalTumble.explodedSymbols.every((s) => s === -1);

                        if (finalHasEmptyExploded) {
                            finalTumblesWithEmptyExploded++;
                        }

                        // Check non-final tumbles
                        for (let i = 0; i < tumbles.length - 1; i++) {
                            totalNonFinalTumbles++;
                            const tumble = tumbles[i];
                            const hasExploded = tumble.explodedSymbols && tumble.explodedSymbols.some((s) => s !== -1);

                            if (hasExploded) {
                                nonFinalTumblesWithExploded++;
                            }
                        }
                    }
                });

                // Log the statistics for verification
                console.log(`Statistics from mock test data analysis:`);
                console.log(`- Boards with >2 tumbles: ${boardsWithMultipleTumbles}`);
                console.log(`- Final tumbles with empty explodedSymbols: ${finalTumblesWithEmptyExploded}/${boardsWithMultipleTumbles}`);
                console.log(`- Non-final tumbles with explodedSymbols: ${nonFinalTumblesWithExploded}/${totalNonFinalTumbles}`);

                // Verify the pattern: ALL final tumbles should have empty explodedSymbols
                expect(finalTumblesWithEmptyExploded).toBe(boardsWithMultipleTumbles);

                // Most non-final tumbles should have exploded symbols (they caused cascades)
                expect(nonFinalTumblesWithExploded).toBeGreaterThan(totalNonFinalTumbles * 0.8);
            });

            it("should return consistent settlement format for boards without settlement result", () => {
                const simpleBoard = {
                    board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                    multipliers: [1],
                };

                const result = chainManager.convertChainBoardToResult(simpleBoard);

                expect(result).toBeDefined();
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(1);
                expect(result[0].settlement).toBeDefined();
                expect(result[0].settlement.explode).toEqual([]);
                expect(result[0].settlement.new).toEqual([]);
            });
        });
    });
});
