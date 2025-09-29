import ChainManager from "../chain-manager";

const mockGameData = {
    gameConfigs: {
        gameId: "test-game-123",
        cascadingSlotsConfig: {
            resultChains: {
                enabled: false,
                reload: false,
            },
        },
    },
    chainBoardsCache: {},
};
const mockLogService = {
    log: jest.fn(),
    logWarning: jest.fn(),
    logError: jest.fn(),
};

const mockResultChainRepository = {
    find: jest.fn(),
};

const mockAssignmentRepository = {
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    findOne: jest.fn().mockResolvedValue(null),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
        }),
    }),
    distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
    }),
};

const mockAppConfigs = {
    resultChains: {
        enabled: true,
        maxChains: 300,
        maxPlayerChains: 300,
        memoryExpirationMinutes: 30,
        assignment: {
            minPlayableBoards: 50,
            maxBoards: 100,
            boardsMultiplier: 0.25,
            boardRange: [50, 75, 100, 125, 150, 175, 200],
        },
    },
};

const mockDatabaseChains = [
    {
        _id: "68ba82677350005bcefd0fbe",
        name: "test-chain",
        totalBoardCount: 150,
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
        mockResultChainRepository.find.mockImplementation((query = {}) => {
            // Filter chains based on query
            let filteredChains = mockDatabaseChains;
            if (query.totalBoardCount && query.totalBoardCount.$lt) {
                filteredChains = mockDatabaseChains.filter((chain) => chain.totalBoardCount < query.totalBoardCount.$lt);
            }

            return {
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(filteredChains.sort((a, b) => b._id.localeCompare(a._id))),
                        }),
                    }),
                }),
                limit: jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(filteredChains),
                    }),
                }),
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(filteredChains),
                }),
            };
        });

        chainManager = new ChainManager({
            gameData: mockGameData,
            logService: mockLogService,
            resultChainRepository: mockResultChainRepository,
            assignmentRepository: mockAssignmentRepository,
            appConfigs: mockAppConfigs,
        });
        // Enable chains via gameConfigs for tests
        mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
        await chainManager.loadChains();
    });

    describe("constructor", () => {
        it("should initialize with gameData, logService, resultChainRepository, assignmentRepository, and appConfigs", () => {
            expect(chainManager.gameData).toBe(mockGameData);
            expect(chainManager.logService).toBe(mockLogService);
            expect(chainManager.resultChainRepository).toBe(mockResultChainRepository);
            expect(chainManager.assignmentRepository).toBe(mockAssignmentRepository);
            expect(chainManager.appConfigs).toBe(mockAppConfigs);
        });

        it("should initialize without chainConfigs wrapper", () => {
            const freshChainManager = new ChainManager({
                gameData: mockGameData,
                logService: mockLogService,
                resultChainRepository: mockResultChainRepository,
                assignmentRepository: mockAssignmentRepository,
                appConfigs: {}, // Empty appConfigs to test defaults
            });
            expect(freshChainManager.chainConfigs).toBeUndefined();
        });

        it("should load chain data on initialization", () => {
            expect(mockGameData.availableChains).toHaveLength(1);
            expect(mockGameData.availableChains[0].name).toBe("test-chain");
        });
    });

    describe("loadChains", () => {
        it("should append new chains without disrupting active player chains", async () => {
            // Set up initial state
            mockGameData.availableChains = [{ name: "old-chain", baseBetAmount: 0.05, totalBoardCount: 75 }];
            mockGameData.playerChains = { player1: {} };

            await chainManager.loadChains();

            expect(mockGameData.availableChains).toHaveLength(2); // old-chain + test-chain
            expect(mockGameData.availableChains.some((chain) => chain.name === "old-chain")).toBe(true);
            expect(mockGameData.availableChains.some((chain) => chain.name === "test-chain")).toBe(true);
            // Player chains should remain intact
            expect(mockGameData.playerChains).toEqual({ player1: {} });
        });

        it("should not add duplicate chains during reload", async () => {
            // Set up initial state with existing test-chain
            mockGameData.availableChains = [
                { name: "test-chain", boards: [], metadata: { name: "test-chain" } },
                { name: "other-chain", boards: [], metadata: { name: "other-chain" } },
            ];

            await chainManager.loadChains();

            // Should not add duplicate test-chain
            expect(mockGameData.availableChains).toHaveLength(2);
            expect(mockGameData.availableChains.filter((chain) => chain.name === "test-chain")).toHaveLength(1);
        });
    });

    describe("isChainEnabled", () => {
        it("should return true when gameConfigs.enabled is true", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
            expect(chainManager.isChainEnabled()).toBe(true);
        });

        it("should return false when gameConfigs.enabled is false", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
            expect(chainManager.isChainEnabled()).toBe(false);
        });

        it("should only check gameConfigs (not appConfigs)", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
            // Even if appConfigs has different settings, should only check gameConfigs
            expect(chainManager.isChainEnabled()).toBe(false);
        });
    });

    describe("loadChains", () => {
        it("should not load chains when feature is disabled via gameConfigs", async () => {
            jest.clearAllMocks();

            // Create clean gameData for isolated test
            const cleanGameData = {
                gameConfigs: { gameId: "test-game-123" },
                playerChains: {},
                availableChains: [],
            };

            const disabledChainManager = new ChainManager({
                gameData: cleanGameData,
                logService: mockLogService,
                resultChainRepository: mockResultChainRepository,
                assignmentRepository: mockAssignmentRepository,
                appConfigs: mockAppConfigs,
            });
            cleanGameData.gameConfigs.cascadingSlotsConfig = { resultChains: { enabled: false } };

            await disabledChainManager.loadChains();

            expect(cleanGameData.availableChains).toHaveLength(0);
            expect(mockResultChainRepository.find).not.toHaveBeenCalled();
        });

        it("should prevent duplicate chains during multiple loads", async () => {
            // Load chains initially
            await chainManager.loadChains();
            const initialCount = mockGameData.availableChains.length;

            // Load again - should not add duplicates
            await chainManager.loadChains();

            expect(mockGameData.availableChains).toHaveLength(initialCount);
            // Ensure we still have the same chain
            expect(mockGameData.availableChains.some((chain) => chain.name === "test-chain")).toBe(true);
        });

        it("should indicate that active player chains will be loaded by UserChainConsumer", async () => {
            // Reset gameData and reload
            mockGameData.playerChains = {};
            await chainManager.loadChains();

            // Active player chains are now loaded by UserChainConsumer, not ChainManager
            expect(mockGameData.playerChains).toEqual({});
        });
    });

    // Chain assignment is now handled by UserChainConsumer
    // These tests have been moved to user-chain-consumer.test.js

    describe("getNextResult", () => {
        beforeEach(() => {
            // Manually set up a player chain for testing
            mockGameData.playerChains["testPlayer"] = {
                name: "test-chain",
                currentIndex: 0,
                totalBoards: 3,
                assignedAt: new Date(),
                isFreeSpin: false,
                freeSpinChain: [],
            };

            // Set up the chain boards cache
            mockGameData.chainBoardsCache = {
                "test-chain": [...mockDatabaseChains[0].boardsData],
            };
        });

        it("should return first board result", async () => {
            // Set up player chain with composite key using baseBetAmount
            mockGameData.playerChains["testPlayer-0.10"] = {
                name: "test-chain",
                currentIndex: 0,
                totalBoards: 3,
                assignedAt: new Date(),
                betLevel: 1,
                coinValue: 0.1,
                playerName: "testPlayer",
            };

            const result = await chainManager.getNextResult("testPlayer", { betLevel: 1, coinValue: 0.1 }, { isFreeSpin: false });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(mockGameData.playerChains["testPlayer-0.10"].currentIndex).toBe(0); // getNextResult no longer increments
        });

        it("should return current board regardless of free spin context", async () => {
            const result = await chainManager.getNextResult("testPlayer", {}, { isFreeSpin: true });

            expect(result).toBeDefined();
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(0); // getNextResult no longer increments
        });

        it("should return null for player without chain", async () => {
            // Mock assignmentRepository to return no active assignment
            mockAssignmentRepository.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                }),
            });

            const result = await chainManager.getNextResult("unknownPlayer", { betLevel: 1, coinValue: 0.1 }, { isFreeSpin: false });
            expect(result).toBeNull();
        });

        it("should return null when chain is complete", async () => {
            // Simulate chain completion by setting currentIndex to total boards
            mockGameData.playerChains["testPlayer"].currentIndex = 3;
            const result = await chainManager.getNextResult("testPlayer");
            expect(result).toBeNull();
        });

        it("should reload chain from database when not in memory", async () => {
            // Mock active assignment in database
            const mockAssignment = {
                chainName: "test-chain",
                currentBoardIndex: 1,
                totalBoards: 3,
                assignedAt: new Date(),
                betLevel: 1,
                coinValue: 0.1,
                playerId: "player123",
                playerName: "testPlayer",
            };

            mockAssignmentRepository.findOne.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockAssignment),
                }),
            });

            // Mock getBoardsByChainName on the chainManager instance
            chainManager.getBoardsByChainName = jest.fn().mockResolvedValue([...mockDatabaseChains[0].boardsData]);

            const result = await chainManager.getNextResult("testPlayer", { betLevel: 1, coinValue: 0.1 }, { isFreeSpin: false });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
        });
    });

    describe("getChainStatus", () => {
        it("should return hasChain false for player without chain", () => {
            const status = chainManager.getChainStatus("unknownPlayer", 1, 0.1);
            expect(status.hasChain).toBe(false);
        });

        it("should return chain status for player with chain", () => {
            // Manually set up a player chain for testing with composite key using baseBetAmount
            const assignedAt = new Date();
            mockGameData.playerChains["testPlayer-0.10"] = {
                name: "test-chain",
                boards: [],
                currentIndex: 0,
                totalBoards: 3,
                assignedAt,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "testPlayer",
                boardsLoaded: true,
            };
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            expect(status.hasChain).toBe(true);
            expect(status.chainName).toBe("test-chain");
            expect(status.progress).toBe("0/3");
            expect(status.betLevel).toBe(1);
            expect(status.coinValue).toBe(0.1);
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

                    result.forEach((tumbleResult, resultIndex) => {
                        // Verify RoundCalculator format structure (used by preGeneratedResult)
                        expect(tumbleResult.explodedSymbols).toBeDefined();
                        expect(tumbleResult.newSymbols).toBeDefined();

                        if (resultIndex === 0) {
                            // First result item should have empty cascade data (for initial tumble creation)
                            expect(tumbleResult.explodedSymbols).toEqual([]);
                            expect(tumbleResult.newSymbols).toEqual([]);
                        } else {
                            // Subsequent result items contain cascade data from PREVIOUS tumble
                            const previousTumble = tumbles[resultIndex - 1];

                            if (previousTumble.explodedSymbols) {
                                expect(tumbleResult.explodedSymbols).toEqual(previousTumble.explodedSymbols);
                            }

                            if (previousTumble.newSymbols) {
                                expect(tumbleResult.newSymbols).toEqual(previousTumble.newSymbols);
                            }
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

            it("should return consistent RoundCalculator format for boards without settlement result", () => {
                const simpleBoard = {
                    board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
                    multipliers: [1],
                };

                const result = chainManager.convertChainBoardToResult(simpleBoard);

                expect(result).toBeDefined();
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(1);
                expect(result[0].explodedSymbols).toEqual([]);
                expect(result[0].newSymbols).toEqual([]);
            });

            it("should correctly populate RoundCalculator format for preGeneratedResult compatibility", () => {
                // Test with the 3-tumble board that has exploded symbols
                const boardWithExplodedSymbols = mockMultiTumbleTestData.boards[0];

                const result = chainManager.convertChainBoardToResult(boardWithExplodedSymbols);

                expect(result).toBeDefined();
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(3); // 3 tumbles

                // Verify first result item (for creating first tumble) - RoundCalculator format
                const firstResultItem = result[0];
                expect(firstResultItem.explodedSymbols).toEqual([]); // Empty - no cascade data for initial tumble creation
                expect(firstResultItem.newSymbols).toEqual([]); // Empty - no cascade data for initial tumble creation

                // Verify second result item (cascade data for first tumble) - RoundCalculator format
                const secondResultItem = result[1];
                expect(secondResultItem.explodedSymbols).toEqual([
                    -1, -1, -1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]); // First tumble's cascade data
                expect(secondResultItem.newSymbols).toEqual([
                    2, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]); // First tumble's cascade data

                // Verify third result item (cascade data for second tumble) - RoundCalculator format
                const thirdResultItem = result[2];
                expect(thirdResultItem.explodedSymbols).toEqual([
                    -1, -1, -1, 2, 2, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]); // Second tumble's cascade data
                expect(thirdResultItem.newSymbols).toEqual([
                    5, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]); // Second tumble's cascade data

                // Verify all tumbles have the required structure for RoundCalculator preGeneratedResult
                result.forEach((tumble, index) => {
                    expect(tumble).toHaveProperty("newBoard");
                    expect(tumble).toHaveProperty("multipliers");
                    expect(tumble).toHaveProperty("explodedSymbols");
                    expect(tumble).toHaveProperty("newSymbols");

                    // Arrays should be defined (empty or populated)
                    expect(Array.isArray(tumble.explodedSymbols)).toBe(true);
                    expect(Array.isArray(tumble.newSymbols)).toBe(true);
                    expect(Array.isArray(tumble.newBoard)).toBe(true);
                    expect(Array.isArray(tumble.multipliers)).toBe(true);
                });
            });
        });
    });
});
