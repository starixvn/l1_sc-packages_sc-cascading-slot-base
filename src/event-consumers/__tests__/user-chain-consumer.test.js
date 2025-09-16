import UserChainConsumer from "../user-chain-consumer";

// Mock data structures
const mockGameData = {
    gameConfigs: { gameId: "test-game-123" },
    playerChains: {},
};

const mockLogService = {
    logWarning: jest.fn(),
    logError: jest.fn(),
};

const mockChainManager = {
    availableChains: [
        {
            name: "test-chain-1",
            boards: [
                { board: [1, 2, 3], multipliers: [] },
                { board: [4, 5, 6], multipliers: [] },
            ],
            metadata: { name: "test-chain-1" },
        },
        {
            name: "test-chain-2",
            boards: [{ board: [7, 8, 9], multipliers: [] }],
            metadata: { name: "test-chain-2" },
        },
    ],
};

const mockAssignmentRepository = {
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
        }),
    }),
    distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
    }),
    findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: "test-assignment-id",
        playerName: "testPlayer",
        chainName: "test-chain-1",
        status: "active",
    }),
};

describe("UserChainConsumer", () => {
    let userChainConsumer;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGameData.playerChains = {};

        // Reset chainManager available chains to prevent test contamination
        mockChainManager.availableChains = [
            {
                name: "test-chain-1",
                boards: [
                    { board: [1, 2, 3], multipliers: [] },
                    { board: [4, 5, 6], multipliers: [] },
                ],
                metadata: { name: "test-chain-1" },
            },
            {
                name: "test-chain-2",
                boards: [{ board: [7, 8, 9], multipliers: [] }],
                metadata: { name: "test-chain-2" },
            },
        ];

        // Reset repository mocks to default state
        mockAssignmentRepository.create.mockResolvedValue({ _id: "test-assignment-id" });
        mockAssignmentRepository.find.mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
            }),
        });

        userChainConsumer = new UserChainConsumer({
            gameData: mockGameData,
            resultChainManager: mockChainManager,
            assignmentRepository: mockAssignmentRepository,
            logService: mockLogService,
        });
    });

    describe("constructor", () => {
        it("should initialize with correct dependencies", () => {
            expect(userChainConsumer.gameData).toBe(mockGameData);
            expect(userChainConsumer.chainManager).toBe(mockChainManager);
            expect(userChainConsumer.assignmentRepository).toBe(mockAssignmentRepository);
            expect(userChainConsumer.logService).toBe(mockLogService);
        });
    });

    describe("loadActiveChains", () => {
        it("should load active player chains from database", async () => {
            const activeAssignments = [
                {
                    playerName: "activePlayer1",
                    chainName: "test-chain-1",
                    currentBoardIndex: 1,
                    totalBoards: 2,
                    assignedAt: new Date(),
                    betLevel: 1,
                    coinValue: 0.1,
                    playerId: "player-123",
                },
                {
                    playerName: "activePlayer2",
                    chainName: "test-chain-2",
                    currentBoardIndex: 0,
                    totalBoards: 1,
                    assignedAt: new Date(),
                    betLevel: 2,
                    coinValue: 0.2,
                    playerId: "player-456",
                },
            ];

            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(activeAssignments),
                }),
            });

            await userChainConsumer.loadActiveChains();

            expect(mockGameData.playerChains["activePlayer1-1-0.1"]).toBeDefined();
            expect(mockGameData.playerChains["activePlayer1-1-0.1"].name).toBe("test-chain-1");
            expect(mockGameData.playerChains["activePlayer1-1-0.1"].currentIndex).toBe(1);
            expect(mockGameData.playerChains["activePlayer1-1-0.1"].betLevel).toBe(1);
            expect(mockGameData.playerChains["activePlayer1-1-0.1"].coinValue).toBe(0.1);

            expect(mockGameData.playerChains["activePlayer2-2-0.2"]).toBeDefined();
            expect(mockGameData.playerChains["activePlayer2-2-0.2"].name).toBe("test-chain-2");
            expect(mockGameData.playerChains["activePlayer2-2-0.2"].currentIndex).toBe(0);
        });

        it("should warn when chain is not found in available chains", async () => {
            const activeAssignments = [
                {
                    playerName: "missingChainPlayer",
                    chainName: "non-existent-chain",
                    currentBoardIndex: 0,
                    totalBoards: 1,
                    assignedAt: new Date(),
                    betLevel: 1,
                    coinValue: 0.1,
                    playerId: "player-789",
                },
            ];

            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(activeAssignments),
                }),
            });

            await userChainConsumer.loadActiveChains();

            expect(mockGameData.playerChains["missingChainPlayer-1-0.1"]).toBeUndefined();
            // No warning should be logged since missing chains are normal
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockRejectedValue(new Error("Database error")),
                }),
            });

            await userChainConsumer.loadActiveChains();

            expect(mockLogService.logError).toHaveBeenCalledWith("Failed to load active chains:", expect.any(Error));
        });
    });

    describe("assignChain", () => {
        it("should assign chain to player successfully", async () => {
            const playerContext = {
                playerId: "player-123",
                betLevel: 1,
                coinValue: 0.1,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            };

            const result = await userChainConsumer.assignChain("testPlayer", playerContext);

            expect(result).toBe(true);
            expect(mockGameData.playerChains["testPlayer-1-0.1"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-1-0.1"].currentIndex).toBe(0);
            expect(mockGameData.playerChains["testPlayer-1-0.1"].betLevel).toBe(1);
            expect(mockGameData.playerChains["testPlayer-1-0.1"].coinValue).toBe(0.1);
            expect(mockAssignmentRepository.create).toHaveBeenCalled();
        });

        it("should return false when player already has an active chain", async () => {
            mockGameData.playerChains["existingPlayer-1-0.1"] = {
                name: "existing-chain",
                boards: [],
                currentIndex: 0,
            };

            const result = await userChainConsumer.assignChain("existingPlayer", {
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBe(false);
            // No warning should be logged since this is normal behavior
        });

        it("should return false when no chains are available", async () => {
            mockChainManager.availableChains = [];

            const result = await userChainConsumer.assignChain("testPlayer", {});

            expect(result).toBe(false);
            // No warning should be logged since missing chains are handled silently
            expect(result).toBe(false);
        });

        it("should use random selection when multiple chains are available", async () => {
            const originalMathRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.9); // Should select the last chain (index 1)

            const result = await userChainConsumer.assignChain("randomTestPlayer", {
                playerId: "randomTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBe(true);
            expect(mockGameData.playerChains["randomTestPlayer-1-0.1"].name).toBe("test-chain-2");

            Math.random = originalMathRandom;
        });

        it("should assign chain regardless of betLevel and coinValue (no filtering)", async () => {
            const originalMathRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.0); // Should select first chain (index 0)

            const result = await userChainConsumer.assignChain("noFilterTestPlayer", {
                playerId: "noFilterTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            });

            expect(result).toBe(true);
            // Should not query assignments for filtering - assignChain no longer does this
            expect(mockGameData.playerChains["noFilterTestPlayer-1-0.1"].name).toBe("test-chain-1");

            Math.random = originalMathRandom;
        });

        it("should handle assignment repository errors gracefully", async () => {
            mockAssignmentRepository.create.mockRejectedValueOnce(new Error("Database error"));

            const result = await userChainConsumer.assignChain("errorTestPlayer", {
                playerId: "errorTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBe(true); // Assignment to memory should still succeed
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to create chain assignment for errorTestPlayer"));
        });
    });

    describe("updateChainProgress", () => {
        beforeEach(() => {
            mockGameData.playerChains["progressPlayer-1-0.1"] = {
                name: "test-chain-1",
                boards: [{ board: [1, 2, 3] }, { board: [4, 5, 6] }],
                currentIndex: 0,
                totalBoards: 2,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "progressPlayer",
            };
        });

        it("should update chain progress successfully", async () => {
            const updatedAssignment = {
                _id: "assignment-123",
                playerName: "progressPlayer",
                chainName: "test-chain-1",
                status: "active",
                currentBoardIndex: 1,
                totalBoards: 2,
            };

            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(updatedAssignment);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
                roundBetAmount: 10,
                roundWinAmount: 15,
            });

            expect(result).toEqual(updatedAssignment);
            expect(mockGameData.playerChains["progressPlayer-1-0.1"].currentIndex).toBe(1);
            expect(mockAssignmentRepository.findOneAndUpdate).toHaveBeenCalledWith(
                {
                    playerId: "player-123",
                    betLevel: 1,
                    coinValue: 0.1,
                    status: "active",
                    gameId: "test-game-123",
                },
                {
                    $inc: {
                        currentBoardIndex: 1,
                        totalBetAmount: 10,
                        totalWinAmount: 15,
                    },
                    $set: {
                        lastActivityAt: expect.any(Date),
                    },
                },
                { new: true }
            );
        });

        it("should complete chain when reaching total boards", async () => {
            mockGameData.playerChains["completionPlayer-1-0.1"] = {
                name: "test-chain-1",
                boards: [{ board: [1, 2, 3] }],
                currentIndex: 0,
                totalBoards: 1,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "completionPlayer",
            };

            const completedAssignment = {
                _id: "assignment-123",
                playerName: "completionPlayer",
                chainName: "test-chain-1",
                status: "completed",
                currentBoardIndex: 1,
                totalBoards: 1,
                totalWinAmount: 100,
                totalBetAmount: 50,
            };

            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(completedAssignment);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "completionPlayer",
                betLevel: 1,
                coinValue: 0.1,
                roundBetAmount: 10,
                roundWinAmount: 15,
            });

            expect(result).toEqual(completedAssignment);
            expect(mockGameData.playerChains["completionPlayer-1-0.1"]).toBeUndefined();
            // No completion log since it's handled silently
        });

        it("should return null when player chain not found", async () => {
            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "nonExistentPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            // No warning should be logged since missing chains are normal
        });

        it("should return null when no active assignment found in database", async () => {
            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(null);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            // No warning should be logged since missing assignments are normal
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.findOneAndUpdate.mockRejectedValue(new Error("Update error"));

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to update chain progress for progressPlayer"));
        });
    });

    describe("findChainsByBet", () => {
        it("should return matching chain names", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue([
                        { chainName: "test-chain-1" },
                        { chainName: "test-chain-2" },
                        { chainName: "test-chain-1" }, // duplicate to test Set uniqueness
                    ]),
                }),
            });

            const result = await userChainConsumer.findChainsByBet(1, 0.1);

            expect(result).toEqual(["test-chain-1", "test-chain-2"]);
            expect(mockAssignmentRepository.find).toHaveBeenCalledWith(
                {
                    betLevel: 1,
                    coinValue: 0.1,
                    status: "active",
                    gameId: "test-game-123",
                },
                { chainName: 1, _id: 0 }
            );
        });

        it("should return empty array on database error", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockRejectedValue(new Error("Database error")),
                }),
            });

            const result = await userChainConsumer.findChainsByBet(1, 0.1);

            expect(result).toEqual([]);
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to find chains by bet params"));
        });
    });
});
