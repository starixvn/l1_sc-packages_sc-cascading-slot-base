import ChainManager from "../chain-manager";

const TEST_GAME_ID = "test-game-123";
const TEST_CHAIN_NAME = "test-chain";

const createMockGameData = (overrides = {}) => ({
    gameConfigs: {
        gameId: TEST_GAME_ID,
        cascadingSlotsConfig: {
            resultChains: {
                enabled: false,
                reload: false,
            },
        },
    },
    chainBoardsCache: {},
    availableChains: [],
    playerChains: {},
    ...overrides,
});

const createMockLogService = () => ({
    log: jest.fn(),
    logWarning: jest.fn(),
    logError: jest.fn(),
});

const createMockResultChainRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
});

const createMockAssignmentRepository = () => ({
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    findOne: jest.fn().mockResolvedValue(null),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
        }),
    }),
    distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
    }),
});

const createMockAppConfigs = (overrides = {}) => ({
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
        ...overrides,
    },
});

const createMockBoard = (overrides = {}) => ({
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
    ...overrides,
});

const createMockChain = (overrides = {}) => ({
    _id: "68ba82677350005bcefd0fbe",
    name: TEST_CHAIN_NAME,
    totalBoardCount: 150,
    baseBetAmount: 0.1,
    boardsData: [createMockBoard()],
    createdAt: new Date("2025-09-05T06:25:43.344Z"),
    ...overrides,
});

const mockGameData = createMockGameData();
const mockLogService = createMockLogService();
const mockResultChainRepository = createMockResultChainRepository();
const mockAssignmentRepository = createMockAssignmentRepository();
const mockAppConfigs = createMockAppConfigs();

const mockDatabaseChains = [
    createMockChain({
        boardsData: [
            createMockBoard(),
            createMockBoard({
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
            }),
            createMockBoard({
                board: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                settlementResult: {
                    tumbles: [
                        {
                            originalBoard: "2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2",
                            multipliers: [1],
                            icons: {},
                        },
                    ],
                },
            }),
        ],
    }),
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
        it("should initialize gameData property", () => {
            // Assert
            expect(chainManager.gameData).toBe(mockGameData);
        });

        it("should initialize logService property", () => {
            // Assert
            expect(chainManager.logService).toBe(mockLogService);
        });

        it("should initialize resultChainRepository property", () => {
            // Assert
            expect(chainManager.resultChainRepository).toBe(mockResultChainRepository);
        });

        it("should initialize assignmentRepository property", () => {
            // Assert
            expect(chainManager.assignmentRepository).toBe(mockAssignmentRepository);
        });

        it("should initialize appConfigs property", () => {
            // Assert
            expect(chainManager.appConfigs).toBe(mockAppConfigs);
        });

        it("should initialize playerChains as empty object when not provided", () => {
            // Arrange
            const gameData = createMockGameData();
            delete gameData.playerChains;

            // Act
            const manager = new ChainManager({
                gameData,
                logService: mockLogService,
                resultChainRepository: mockResultChainRepository,
                assignmentRepository: mockAssignmentRepository,
                appConfigs: {},
            });

            // Assert
            expect(manager.gameData.playerChains).toEqual({});
        });

        it("should initialize availableChains as empty array when not provided", () => {
            // Arrange
            const gameData = createMockGameData();
            delete gameData.availableChains;

            // Act
            const manager = new ChainManager({
                gameData,
                logService: mockLogService,
                resultChainRepository: mockResultChainRepository,
                assignmentRepository: mockAssignmentRepository,
                appConfigs: {},
            });

            // Assert
            expect(manager.gameData.availableChains).toEqual([]);
        });

        it("should initialize chainBoardsCache as empty object when not provided", () => {
            // Arrange
            const gameData = createMockGameData();
            delete gameData.chainBoardsCache;

            // Act
            const manager = new ChainManager({
                gameData,
                logService: mockLogService,
                resultChainRepository: mockResultChainRepository,
                assignmentRepository: mockAssignmentRepository,
                appConfigs: {},
            });

            // Assert
            expect(manager.gameData.chainBoardsCache).toEqual({});
        });
    });

    describe("loadChains", () => {
        beforeEach(() => {
            mockGameData.availableChains = [];
            mockGameData.playerChains = {};
        });

        it("should add new chains to availableChains", async () => {
            // Arrange
            mockGameData.availableChains = [{ name: "old-chain", baseBetAmount: 0.05, totalBoardCount: 75 }];

            // Act
            await chainManager.loadChains();

            // Assert
            expect(mockGameData.availableChains).toHaveLength(2);
        });

        it("should preserve existing chains when loading new ones", async () => {
            // Arrange
            const existingChain = { name: "old-chain", baseBetAmount: 0.05, totalBoardCount: 75 };
            mockGameData.availableChains = [existingChain];

            // Act
            await chainManager.loadChains();

            // Assert
            expect(mockGameData.availableChains.some((chain) => chain.name === "old-chain")).toBe(true);
        });

        it("should add test-chain from database", async () => {
            // Arrange
            mockGameData.availableChains = [{ name: "old-chain", baseBetAmount: 0.05, totalBoardCount: 75 }];

            // Act
            await chainManager.loadChains();

            // Assert
            expect(mockGameData.availableChains.some((chain) => chain.name === "test-chain")).toBe(true);
        });

        it("should not modify player chains during load", async () => {
            // Arrange
            const existingPlayerChains = { player1: {} };
            mockGameData.playerChains = existingPlayerChains;

            // Act
            await chainManager.loadChains();

            // Assert
            expect(mockGameData.playerChains).toEqual(existingPlayerChains);
        });

        it("should not add duplicate chains", async () => {
            // Arrange
            mockGameData.availableChains = [
                { name: "test-chain", boards: [], metadata: { name: "test-chain" } },
                { name: "other-chain", boards: [], metadata: { name: "other-chain" } },
            ];

            // Act
            await chainManager.loadChains();

            // Assert
            expect(mockGameData.availableChains).toHaveLength(2);
        });

        it("should have only one instance of test-chain after reload", async () => {
            // Arrange
            mockGameData.availableChains = [
                { name: "test-chain", boards: [], metadata: { name: "test-chain" } },
                { name: "other-chain", boards: [], metadata: { name: "other-chain" } },
            ];

            // Act
            await chainManager.loadChains();

            // Assert
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
        // Test setup utilities following DRY principles
        const createTestPlayerContext = (overrides = {}) => ({
            betLevel: 1,
            coinValue: 0.1,
            ...overrides,
        });

        const createTestRoundContext = (overrides = {}) => ({
            isFreeSpin: false,
            ...overrides,
        });

        const createTestPlayerChain = (overrides = {}) => ({
            name: "test-chain",
            currentIndex: 0,
            totalBoards: 3,
            assignedAt: new Date(),
            lastActivityAt: new Date(),
            betLevel: 1,
            coinValue: 0.1,
            playerName: "testPlayer",
            ...overrides,
        });

        const createTestBoard = (overrides = {}) => ({
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
            ...overrides,
        });

        const createManagerWithMocks = (mocks = {}) => {
            // Reset all mocks
            jest.clearAllMocks();

            // Apply custom mocks
            if (mocks.isChainEnabled !== undefined) {
                jest.spyOn(chainManager, "isChainEnabled").mockReturnValue(mocks.isChainEnabled);
            }

            if (mocks.getPlayerChain !== undefined) {
                jest.spyOn(chainManager, "getPlayerChain").mockResolvedValue(mocks.getPlayerChain);
            }

            if (mocks.getBoardsByChainName !== undefined) {
                jest.spyOn(chainManager, "getBoardsByChainName").mockResolvedValue(mocks.getBoardsByChainName);
            }

            if (mocks.convertChainBoardToResult !== undefined) {
                jest.spyOn(chainManager, "convertChainBoardToResult").mockReturnValue(mocks.convertChainBoardToResult);
            }

            if (mocks.playerChains !== undefined) {
                mockGameData.playerChains = mocks.playerChains;
            }

            if (mocks.chainBoardsCache !== undefined) {
                mockGameData.chainBoardsCache = mocks.chainBoardsCache;
            }

            return chainManager;
        };

        afterEach(() => {
            jest.restoreAllMocks();
            mockGameData.playerChains = {};
            mockGameData.chainBoardsCache = {};
        });

        describe("when chains are disabled", () => {
            it("should return null", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const manager = createManagerWithMocks({ isChainEnabled: false });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should not call getPlayerChain", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const manager = createManagerWithMocks({ isChainEnabled: false });
                const getPlayerChainSpy = jest.spyOn(manager, "getPlayerChain");

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(getPlayerChainSpy).not.toHaveBeenCalled();
            });
        });

        describe("when round is free spin", () => {
            it("should return null", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext({ isFreeSpin: true });
                const manager = createManagerWithMocks({ isChainEnabled: true });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should not call getPlayerChain", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext({ isFreeSpin: true });
                const manager = createManagerWithMocks({ isChainEnabled: true });
                const getPlayerChainSpy = jest.spyOn(manager, "getPlayerChain");

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(getPlayerChainSpy).not.toHaveBeenCalled();
            });
        });

        describe("when player has no chain", () => {
            it("should return null when getPlayerChain returns null", async () => {
                // Arrange
                const playerName = "unknownPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: null,
                });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should call getPlayerChain with correct parameters", async () => {
                // Arrange
                const playerName = "unknownPlayer";
                const playerContext = createTestPlayerContext({ betLevel: 5, coinValue: 0.2 });
                const roundContext = createTestRoundContext();
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: null,
                });
                const getPlayerChainSpy = jest.spyOn(manager, "getPlayerChain");

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(getPlayerChainSpy).toHaveBeenCalledWith("unknownPlayer", 5, 0.2);
            });
        });

        describe("when chain is complete", () => {
            it("should return null when currentIndex equals totalBoards", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain({ currentIndex: 3, totalBoards: 3 });
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should return null when currentIndex exceeds totalBoards", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain({ currentIndex: 5, totalBoards: 3 });
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("when boards are not found", () => {
            it("should return null when getBoardsByChainName returns null", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain();
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                    getBoardsByChainName: null,
                });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should call getBoardsByChainName with correct chain name", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain({ name: "specific-chain" });
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                    getBoardsByChainName: null,
                });
                const getBoardsSpy = jest.spyOn(manager, "getBoardsByChainName");

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(getBoardsSpy).toHaveBeenCalledWith("specific-chain");
            });
        });

        describe("successful scenarios", () => {
            it("should return converted board result", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain({ currentIndex: 1 });
                const boards = [createTestBoard(), createTestBoard(), createTestBoard()];
                const expectedResult = [{ board: "converted-result" }];
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                    getBoardsByChainName: boards,
                    convertChainBoardToResult: expectedResult,
                });

                // Act
                const result = await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(result).toEqual(expectedResult);
            });

            it("should call convertChainBoardToResult with current board", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const playerChain = createTestPlayerChain({ currentIndex: 2 });
                const thirdBoard = createTestBoard({ board: [3, 3, 3] });
                const boards = [createTestBoard(), createTestBoard(), thirdBoard];
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                    getBoardsByChainName: boards,
                    convertChainBoardToResult: [{ converted: true }],
                });
                const convertSpy = jest.spyOn(manager, "convertChainBoardToResult");

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(convertSpy).toHaveBeenCalledWith(thirdBoard);
            });

            it("should update lastActivityAt on player chain", async () => {
                // Arrange
                const playerName = "testPlayer";
                const playerContext = createTestPlayerContext();
                const roundContext = createTestRoundContext();
                const originalDate = new Date("2023-01-01");
                const playerChain = createTestPlayerChain({ lastActivityAt: originalDate });
                const boards = [createTestBoard()];
                const manager = createManagerWithMocks({
                    isChainEnabled: true,
                    getPlayerChain: playerChain,
                    getBoardsByChainName: boards,
                    convertChainBoardToResult: [{ result: true }],
                });

                // Act
                await manager.getNextResult(playerName, playerContext, roundContext);

                // Assert
                expect(playerChain.lastActivityAt).not.toEqual(originalDate);
                expect(playerChain.lastActivityAt).toBeInstanceOf(Date);
            });
        });
    });

    describe("getChainStatus", () => {
        const setupPlayerChain = () => {
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
            return assignedAt;
        };

        beforeEach(() => {
            mockGameData.playerChains = {};
        });

        it("should return hasChain false for player without chain", () => {
            // Act
            const status = chainManager.getChainStatus("unknownPlayer", 1, 0.1);

            // Assert
            expect(status.hasChain).toBe(false);
        });

        it("should return hasChain true for player with chain", () => {
            // Arrange
            setupPlayerChain();

            // Act
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            // Assert
            expect(status.hasChain).toBe(true);
        });

        it("should return correct chain name for player with chain", () => {
            // Arrange
            setupPlayerChain();

            // Act
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            // Assert
            expect(status.chainName).toBe("test-chain");
        });

        it("should return correct progress for player with chain", () => {
            // Arrange
            setupPlayerChain();

            // Act
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            // Assert
            expect(status.progress).toBe("0/3");
        });

        it("should return correct betLevel for player with chain", () => {
            // Arrange
            setupPlayerChain();

            // Act
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            // Assert
            expect(status.betLevel).toBe(1);
        });

        it("should return correct coinValue for player with chain", () => {
            // Arrange
            setupPlayerChain();

            // Act
            const status = chainManager.getChainStatus("testPlayer", 1, 0.1);

            // Assert
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

        describe("with multiple tumbles", () => {
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

    describe("isReloadEnabled", () => {
        it("should return true when gameConfigs.resultChains.reload is true", () => {
            chainManager.gameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = true;
            expect(chainManager.isReloadEnabled()).toBe(true);
        });

        it("should return false when gameConfigs.resultChains.reload is false", () => {
            chainManager.gameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = false;
            expect(chainManager.isReloadEnabled()).toBe(false);
        });

        it("should return false when reload property is not defined", () => {
            chainManager.gameData.gameConfigs.cascadingSlotsConfig.resultChains = {};
            expect(chainManager.isReloadEnabled()).toBe(false);
        });
    });

    describe("getDeactivatedChains", () => {
        it("should return chains that exist in availableChains but not in dbChains", () => {
            // Arrange
            const availableChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-B", totalBoardCount: 75 },
                { name: "chain-C", totalBoardCount: 50 },
            ];
            const dbChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-C", totalBoardCount: 50 },
            ];

            // Act
            const deactivated = chainManager.getDeactivatedChains(availableChains, dbChains);

            // Assert
            expect(deactivated).toEqual(["chain-B"]);
        });

        it("should return empty array when no chains are deactivated", () => {
            // Arrange
            const availableChains = [{ name: "chain-A", totalBoardCount: 100 }];
            const dbChains = [{ name: "chain-A", totalBoardCount: 100 }];

            // Act
            const deactivated = chainManager.getDeactivatedChains(availableChains, dbChains);

            // Assert
            expect(deactivated).toEqual([]);
        });

        it("should return all chains when db has no chains", () => {
            // Arrange
            const availableChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-B", totalBoardCount: 75 },
            ];
            const dbChains = [];

            // Act
            const deactivated = chainManager.getDeactivatedChains(availableChains, dbChains);

            // Assert
            expect(deactivated).toEqual(["chain-A", "chain-B"]);
        });
    });

    describe("getNewChains", () => {
        it("should return chains that exist in dbChains but not in availableChains", () => {
            // Arrange
            const availableChains = [{ name: "chain-A", totalBoardCount: 100 }];
            const dbChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-B", totalBoardCount: 75 },
                { name: "chain-C", totalBoardCount: 50 },
            ];

            // Act
            const newChains = chainManager.getNewChains(availableChains, dbChains);

            // Assert
            expect(newChains).toHaveLength(2);
            expect(newChains.map((c) => c.name)).toEqual(["chain-B", "chain-C"]);
        });

        it("should return empty array when no new chains exist", () => {
            // Arrange
            const availableChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-B", totalBoardCount: 75 },
            ];
            const dbChains = [
                { name: "chain-A", totalBoardCount: 100 },
                { name: "chain-B", totalBoardCount: 75 },
            ];

            // Act
            const newChains = chainManager.getNewChains(availableChains, dbChains);

            // Assert
            expect(newChains).toEqual([]);
        });
    });

    describe("markAssignmentsInactive", () => {
        it("should update assignments to inactive status", async () => {
            // Arrange
            const deactivatedChainNames = ["chain-B", "chain-C"];
            mockAssignmentRepository.updateMany.mockResolvedValue({ modifiedCount: 5 });

            // Act
            await chainManager.markAssignmentsInactive(deactivatedChainNames);

            // Assert
            expect(mockAssignmentRepository.updateMany).toHaveBeenCalledWith(
                {
                    chainName: { $in: deactivatedChainNames },
                    status: "active",
                    gameId: "test-game-123",
                },
                {
                    $set: {
                        status: "inactive",
                        deactivatedAt: expect.any(Date),
                    },
                }
            );
        });

        it("should not call updateMany when deactivatedChainNames is empty", async () => {
            // Arrange
            jest.clearAllMocks();

            // Act
            await chainManager.markAssignmentsInactive([]);

            // Assert
            expect(mockAssignmentRepository.updateMany).not.toHaveBeenCalled();
        });

        it("should log errors when database update fails", async () => {
            // Arrange
            const deactivatedChainNames = ["chain-B"];
            mockAssignmentRepository.updateMany.mockRejectedValue(new Error("Database error"));
            jest.clearAllMocks();

            // Act
            await chainManager.markAssignmentsInactive(deactivatedChainNames);

            // Assert
            expect(mockLogService.logError).toHaveBeenCalled();
        });
    });

    describe("clearPlayerChainsCache", () => {
        it("should remove player chains from cache for deactivated chains", () => {
            // Arrange
            mockGameData.playerChains = {
                "player1-0.10": { name: "chain-A", currentIndex: 5 },
                "player2-0.20": { name: "chain-B", currentIndex: 3 },
                "player3-0.15": { name: "chain-C", currentIndex: 2 },
            };

            // Act
            chainManager.clearPlayerChainsCache(["chain-B", "chain-C"]);

            // Assert
            expect(mockGameData.playerChains).toEqual({
                "player1-0.10": { name: "chain-A", currentIndex: 5 },
            });
        });

        it("should not remove any chains when deactivatedChainNames is empty", () => {
            // Arrange
            mockGameData.playerChains = {
                "player1-0.10": { name: "chain-A", currentIndex: 5 },
            };
            const original = { ...mockGameData.playerChains };

            // Act
            chainManager.clearPlayerChainsCache([]);

            // Assert
            expect(mockGameData.playerChains).toEqual(original);
        });
    });

    describe("clearBoardsCache", () => {
        it("should remove board cache for deactivated chains", () => {
            // Arrange
            mockGameData.chainBoardsCache = {
                "chain-A": [{ board: [1, 2, 3] }],
                "chain-B": [{ board: [4, 5, 6] }],
                "chain-C": [{ board: [7, 8, 9] }],
            };

            // Act
            chainManager.clearBoardsCache(["chain-B", "chain-C"]);

            // Assert
            expect(mockGameData.chainBoardsCache).toEqual({
                "chain-A": [{ board: [1, 2, 3] }],
            });
        });

        it("should not remove any cache when deactivatedChainNames is empty", () => {
            // Arrange
            mockGameData.chainBoardsCache = {
                "chain-A": [{ board: [1, 2, 3] }],
            };
            const original = { ...mockGameData.chainBoardsCache };

            // Act
            chainManager.clearBoardsCache([]);

            // Assert
            expect(mockGameData.chainBoardsCache).toEqual(original);
        });
    });

    describe("reloadChains", () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockGameData.availableChains = [];
            mockGameData.playerChains = {};
            mockGameData.chainBoardsCache = {};
            chainManager.appConfigs.resultChains.reload = true;
        });

        it("should not reload when chains are disabled", async () => {
            // Arrange
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;

            // Act
            await chainManager.reloadChains();

            // Assert
            expect(mockResultChainRepository.find).not.toHaveBeenCalled();
        });

        it("should not reload when reload is disabled", async () => {
            // Arrange
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = false;

            // Act
            await chainManager.reloadChains();

            // Assert
            expect(mockResultChainRepository.find).not.toHaveBeenCalled();
        });

        it("should add new chains when they appear in database", async () => {
            // Arrange
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = true;
            mockGameData.availableChains = [{ name: "chain-A", baseBetAmount: 0.1, totalBoardCount: 100 }];

            const newDbChains = [
                { name: "chain-A", baseBetAmount: 0.1, totalBoardCount: 100 },
                { name: "chain-B", baseBetAmount: 0.2, totalBoardCount: 75 },
            ];

            mockResultChainRepository.find.mockImplementation(() => ({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(newDbChains),
                        }),
                    }),
                }),
            }));

            // Act
            await chainManager.reloadChains();

            // Assert
            expect(mockGameData.availableChains).toHaveLength(2);
            expect(mockGameData.availableChains.map((c) => c.name)).toContain("chain-B");
        });

        it("should remove deactivated chains and clear related data", async () => {
            // Arrange
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = true;
            mockGameData.availableChains = [
                { name: "chain-A", baseBetAmount: 0.1, totalBoardCount: 100 },
                { name: "chain-B", baseBetAmount: 0.2, totalBoardCount: 75 },
            ];
            mockGameData.playerChains = {
                "player1-0.10": { name: "chain-A", currentIndex: 5 },
                "player2-0.20": { name: "chain-B", currentIndex: 3 },
            };
            mockGameData.chainBoardsCache = {
                "chain-A": [{ board: [1, 2, 3] }],
                "chain-B": [{ board: [4, 5, 6] }],
            };

            const updatedDbChains = [{ name: "chain-A", baseBetAmount: 0.1, totalBoardCount: 100 }];

            mockResultChainRepository.find.mockImplementation(() => ({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(updatedDbChains),
                        }),
                    }),
                }),
            }));

            mockAssignmentRepository.updateMany.mockResolvedValue({ modifiedCount: 1 });

            // Act
            await chainManager.reloadChains();

            // Assert
            expect(mockGameData.availableChains).toHaveLength(1);
            expect(mockGameData.availableChains[0].name).toBe("chain-A");
            expect(mockGameData.playerChains["player2-0.20"]).toBeUndefined();
            expect(mockGameData.chainBoardsCache["chain-B"]).toBeUndefined();
            expect(mockAssignmentRepository.updateMany).toHaveBeenCalled();
        });

        it("should handle database errors gracefully", async () => {
            // Arrange
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.reload = true;
            mockResultChainRepository.find.mockImplementation(() => {
                throw new Error("Database connection error");
            });

            // Act
            await chainManager.reloadChains();

            // Assert
            expect(mockLogService.logError).toHaveBeenCalled();
        });
    });

    describe("getBoardsByChainName", () => {
        const createMockChainBoards = () => [
            createMockBoard(),
            createMockBoard({ board: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }),
        ];

        beforeEach(() => {
            mockGameData.chainBoardsCache = {};
        });

        describe("when boards are in cache", () => {
            it("should return boards from cache", async () => {
                // Arrange
                const cachedBoards = createMockChainBoards();
                mockGameData.chainBoardsCache[TEST_CHAIN_NAME] = cachedBoards;

                // Act
                const result = await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(result).toBe(cachedBoards);
            });

            it("should not call database when boards are cached", async () => {
                // Arrange
                const cachedBoards = createMockChainBoards();
                mockGameData.chainBoardsCache[TEST_CHAIN_NAME] = cachedBoards;

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockResultChainRepository.findOne).not.toHaveBeenCalled();
            });
        });

        describe("when boards are not in cache", () => {
            it("should fetch boards from database", async () => {
                // Arrange
                const boardsData = createMockChainBoards();
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue({ name: TEST_CHAIN_NAME, boardsData }),
                    }),
                });

                // Act
                const result = await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(result).toEqual(boardsData);
            });

            it("should call findOne with correct chain name", async () => {
                // Arrange
                const boardsData = createMockChainBoards();
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue({ name: TEST_CHAIN_NAME, boardsData }),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockResultChainRepository.findOne).toHaveBeenCalledWith({ name: TEST_CHAIN_NAME });
            });

            it("should cache boards after fetching from database", async () => {
                // Arrange
                const boardsData = createMockChainBoards();
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue({ name: TEST_CHAIN_NAME, boardsData }),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockGameData.chainBoardsCache[TEST_CHAIN_NAME]).toEqual(boardsData);
            });

            it("should return null when chain is not found in database", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                const result = await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(result).toBeNull();
            });

            it("should not cache when chain is not found", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockGameData.chainBoardsCache[TEST_CHAIN_NAME]).toBeUndefined();
            });

            it("should not cache when boardsData is undefined", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue({ name: TEST_CHAIN_NAME }),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockGameData.chainBoardsCache[TEST_CHAIN_NAME]).toBeUndefined();
            });
        });

        describe("error handling", () => {
            it("should return null when database query fails", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database error")),
                    }),
                });

                // Act
                const result = await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(result).toBeNull();
            });

            it("should log error when database query fails", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database error")),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockLogService.logError).toHaveBeenCalled();
            });

            it("should not cache when database query fails", async () => {
                // Arrange
                mockResultChainRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database error")),
                    }),
                });

                // Act
                await chainManager.getBoardsByChainName(TEST_CHAIN_NAME);

                // Assert
                expect(mockGameData.chainBoardsCache[TEST_CHAIN_NAME]).toBeUndefined();
            });
        });
    });

    describe("getPlayerChain", () => {
        const TEST_PLAYER_NAME = "testPlayer";
        const TEST_BET_LEVEL = 1;
        const TEST_COIN_VALUE = 0.1;

        const createMockPlayerChain = (overrides = {}) => ({
            name: TEST_CHAIN_NAME,
            currentIndex: 0,
            totalBoards: 100,
            assignedAt: new Date(),
            lastActivityAt: new Date(),
            betLevel: TEST_BET_LEVEL,
            coinValue: TEST_COIN_VALUE,
            playerName: TEST_PLAYER_NAME,
            ...overrides,
        });

        beforeEach(() => {
            mockGameData.playerChains = {};
        });

        describe("when player chain exists in memory", () => {
            it("should return chain from memory", async () => {
                // Arrange
                const playerChain = createMockPlayerChain();
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);
                mockGameData.playerChains[chainKey] = playerChain;

                // Act
                const result = await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).toBe(playerChain);
            });

            it("should not call reloadChainFromDatabase when chain exists in memory", async () => {
                // Arrange
                const playerChain = createMockPlayerChain();
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);
                mockGameData.playerChains[chainKey] = playerChain;
                const reloadSpy = jest.spyOn(chainManager, "reloadChainFromDatabase");

                // Act
                await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(reloadSpy).not.toHaveBeenCalled();
            });
        });

        describe("when player chain does not exist in memory", () => {
            it("should call reloadChainFromDatabase", async () => {
                // Arrange
                const reloadSpy = jest.spyOn(chainManager, "reloadChainFromDatabase").mockResolvedValue(null);

                // Act
                await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(reloadSpy).toHaveBeenCalled();
            });

            it("should call reloadChainFromDatabase with correct playerName", async () => {
                // Arrange
                const reloadSpy = jest.spyOn(chainManager, "reloadChainFromDatabase").mockResolvedValue(null);

                // Act
                await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(reloadSpy).toHaveBeenCalledWith(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);
            });

            it("should return result from reloadChainFromDatabase", async () => {
                // Arrange
                const playerChain = createMockPlayerChain();
                jest.spyOn(chainManager, "reloadChainFromDatabase").mockResolvedValue(playerChain);

                // Act
                const result = await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).toBe(playerChain);
            });

            it("should return null when reloadChainFromDatabase returns null", async () => {
                // Arrange
                jest.spyOn(chainManager, "reloadChainFromDatabase").mockResolvedValue(null);

                // Act
                const result = await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("chain key generation", () => {
            it("should use correct chain key for different bet levels", async () => {
                // Arrange
                const playerChain = createMockPlayerChain({ betLevel: 5 });
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, 5, TEST_COIN_VALUE);
                mockGameData.playerChains[chainKey] = playerChain;

                // Act
                const result = await chainManager.getPlayerChain(TEST_PLAYER_NAME, 5, TEST_COIN_VALUE);

                // Assert
                expect(result).toBe(playerChain);
            });

            it("should use correct chain key for different coin values", async () => {
                // Arrange
                const playerChain = createMockPlayerChain({ coinValue: 0.5 });
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, TEST_BET_LEVEL, 0.5);
                mockGameData.playerChains[chainKey] = playerChain;

                // Act
                const result = await chainManager.getPlayerChain(TEST_PLAYER_NAME, TEST_BET_LEVEL, 0.5);

                // Assert
                expect(result).toBe(playerChain);
            });
        });
    });

    describe("reloadChainFromDatabase", () => {
        const TEST_PLAYER_NAME = "testPlayer";
        const TEST_BET_LEVEL = 1;
        const TEST_COIN_VALUE = 0.1;
        const TEST_PLAYER_ID = "player-123";

        const createMockAssignment = (overrides = {}) => ({
            _id: "assignment-id",
            playerName: TEST_PLAYER_NAME,
            playerId: TEST_PLAYER_ID,
            chainName: TEST_CHAIN_NAME,
            currentBoardIndex: 5,
            totalBoards: 100,
            betLevel: TEST_BET_LEVEL,
            coinValue: TEST_COIN_VALUE,
            assignedAt: new Date("2025-01-01T00:00:00.000Z"),
            lastActivityAt: new Date("2025-01-02T00:00:00.000Z"),
            status: "active",
            gameId: TEST_GAME_ID,
            ...overrides,
        });

        beforeEach(() => {
            mockGameData.playerChains = {};
        });

        describe("when active assignment exists", () => {
            it("should return player chain object", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).not.toBeNull();
            });

            it("should set correct chain name in player chain", async () => {
                // Arrange
                const assignment = createMockAssignment({ chainName: "custom-chain" });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.name).toBe("custom-chain");
            });

            it("should set correct currentIndex from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment({ currentBoardIndex: 42 });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.currentIndex).toBe(42);
            });

            it("should set correct totalBoards from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment({ totalBoards: 150 });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.totalBoards).toBe(150);
            });

            it("should set correct betLevel from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment({ betLevel: 5 });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, 5, TEST_COIN_VALUE);

                // Assert
                expect(result.betLevel).toBe(5);
            });

            it("should set correct coinValue from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment({ coinValue: 0.5 });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, 0.5);

                // Assert
                expect(result.coinValue).toBe(0.5);
            });

            it("should set correct playerId from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment({ playerId: "player-xyz" });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.playerId).toBe("player-xyz");
            });

            it("should set correct playerName from assignment", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.playerName).toBe(TEST_PLAYER_NAME);
            });

            it("should convert assignedAt to Date object", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.assignedAt).toBeInstanceOf(Date);
            });

            it("should convert lastActivityAt to Date object", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.lastActivityAt).toBeInstanceOf(Date);
            });

            it("should use assignedAt when lastActivityAt is missing", async () => {
                // Arrange
                const assignedDate = new Date("2025-01-01T00:00:00.000Z");
                const assignment = createMockAssignment({ assignedAt: assignedDate, lastActivityAt: null });
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result.lastActivityAt.getTime()).toBe(assignedDate.getTime());
            });

            it("should store player chain in memory cache", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);
                expect(mockGameData.playerChains[chainKey]).toBeDefined();
            });

            it("should use correct chain key when storing in memory", async () => {
                // Arrange
                const assignment = createMockAssignment();
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(assignment),
                    }),
                });
                const chainKey = chainManager.generateChainKey(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockGameData.playerChains[chainKey]).toBe(result);
            });
        });

        describe("when no active assignment exists", () => {
            it("should return null when assignment is not found", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).toBeNull();
            });

            it("should not store in memory when assignment is not found", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(Object.keys(mockGameData.playerChains)).toHaveLength(0);
            });
        });

        describe("database query parameters", () => {
            it("should query with correct playerName", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ playerName: TEST_PLAYER_NAME }));
            });

            it("should query with correct betLevel", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ betLevel: TEST_BET_LEVEL }));
            });

            it("should query with correct coinValue", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ coinValue: TEST_COIN_VALUE }));
            });

            it("should query with active status", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
            });

            it("should query with correct gameId", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ gameId: TEST_GAME_ID }));
            });
        });

        describe("error handling", () => {
            it("should return null when database query fails", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database connection error")),
                    }),
                });

                // Act
                const result = await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(result).toBeNull();
            });

            it("should log error when database query fails", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database connection error")),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(mockLogService.logError).toHaveBeenCalled();
            });

            it("should not store in memory when database query fails", async () => {
                // Arrange
                mockAssignmentRepository.findOne = jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockRejectedValue(new Error("Database connection error")),
                    }),
                });

                // Act
                await chainManager.reloadChainFromDatabase(TEST_PLAYER_NAME, TEST_BET_LEVEL, TEST_COIN_VALUE);

                // Assert
                expect(Object.keys(mockGameData.playerChains)).toHaveLength(0);
            });
        });
    });
});
