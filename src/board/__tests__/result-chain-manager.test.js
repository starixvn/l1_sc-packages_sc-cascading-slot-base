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
});
