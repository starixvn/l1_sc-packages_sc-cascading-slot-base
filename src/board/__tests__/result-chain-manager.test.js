import ChainManager from "../result-chain-manager";

// Mock file system
jest.mock("fs");
jest.mock("path");

const mockGameData = {};
const mockLogService = {
    log: jest.fn(),
    logWarning: jest.fn(),
    logError: jest.fn(),
};

const mockChainData = {
    metadata: {
        name: "test-chain",
        boardCount: 3,
    },
    boards: [
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
};

describe("ChainManager", () => {
    let chainManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock file system to return our test data
        const fs = require("fs");
        const path = require("path");

        path.join.mockReturnValue("/mock/path/to/chain.json");
        fs.readFileSync.mockReturnValue(JSON.stringify(mockChainData));

        chainManager = new ChainManager(mockGameData, mockLogService);
    });

    describe("constructor", () => {
        it("should initialize with gameData and logService", () => {
            expect(chainManager.gameData).toBe(mockGameData);
            expect(chainManager.logService).toBe(mockLogService);
        });

        it("should load chain data on initialization", () => {
            expect(chainManager.availableChains).toHaveLength(1);
            expect(chainManager.availableChains[0].name).toBe("test-chain");
        });
    });

    describe("assignChain", () => {
        it("should assign chain to player successfully", () => {
            const result = chainManager.assignChain("testPlayer");

            expect(result).toBe(true);
            expect(mockGameData.playerChains["testPlayer"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(0);
            expect(mockGameData.playerChains["testPlayer"].totalBoards).toBe(3);
        });

        it("should return false when no chains available", () => {
            chainManager.availableChains = [];
            const result = chainManager.assignChain("testPlayer");

            expect(result).toBe(false);
            expect(mockLogService.logWarning).toHaveBeenCalled();
        });
    });

    describe("getNextResult", () => {
        beforeEach(() => {
            chainManager.assignChain("testPlayer");
        });

        it("should return first board result", () => {
            const result = chainManager.getNextResult("testPlayer", false);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(1);
        });

        it("should return free spin board when requested", () => {
            const result = chainManager.getNextResult("testPlayer", true);

            expect(result).toBeDefined();
            expect(mockGameData.playerChains["testPlayer"].currentIndex).toBe(3); // Should skip to free spin board
        });

        it("should return null for player without chain", () => {
            const result = chainManager.getNextResult("unknownPlayer", false);
            expect(result).toBeNull();
        });

        it("should clean up and return null when chain is complete", () => {
            // Use up all boards
            chainManager.getNextResult("testPlayer", false); // Board 1
            chainManager.getNextResult("testPlayer", false); // Board 2
            chainManager.getNextResult("testPlayer", false); // Board 3

            const result = chainManager.getNextResult("testPlayer", false); // Should be null

            expect(result).toBeNull();
            expect(mockGameData.playerChains["testPlayer"]).toBeUndefined();
        });
    });

    describe("shouldAssignChain", () => {
        it("should return true for player without chain", () => {
            expect(chainManager.shouldAssignChain("newPlayer")).toBe(true);
        });

        it("should return false for player with chain", () => {
            chainManager.assignChain("testPlayer");
            expect(chainManager.shouldAssignChain("testPlayer")).toBe(false);
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
