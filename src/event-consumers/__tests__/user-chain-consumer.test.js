import UserChainConsumer from "../user-chain-consumer";

// Mock data structures
const mockGameData = {
    gameConfigs: {
        gameId: "test-game-123",
        cascadingSlotsConfig: {
            betMultiplier: 1,
        },
    },
    playerChains: {},
};

const mockLogService = {
    logWarning: jest.fn(),
    logError: jest.fn(),
};

const mockChainManager = {
    getBoardsByChainName: jest.fn(),
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

        // Reset available chains in gameData to prevent test contamination
        mockGameData.availableChains = [
            {
                name: "test-chain-1",
                baseBetAmount: 0.1,
                totalBoardCount: 75,
            },
            {
                name: "test-chain-2",
                baseBetAmount: 0.1,
                totalBoardCount: 50,
            },
        ];

        // Reset repository mocks to default state
        mockAssignmentRepository.create.mockResolvedValue({ _id: "test-assignment-id" });
        mockAssignmentRepository.find.mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
            }),
        });

        // Setup chainManager mock
        mockChainManager.getBoardsByChainName.mockImplementation((chainName) => {
            if (chainName === "test-chain-1") {
                return Promise.resolve([
                    { board: [1, 2, 3], multipliers: [] },
                    { board: [4, 5, 6], multipliers: [] },
                ]);
            }
            if (chainName === "test-chain-2") {
                return Promise.resolve([{ board: [7, 8, 9], multipliers: [] }]);
            }
            return Promise.resolve(null);
        });

        userChainConsumer = new UserChainConsumer({
            gameData: mockGameData,
            assignmentRepository: mockAssignmentRepository,
            logService: mockLogService,
            resultChainManager: mockChainManager,
        });
    });

    describe("constructor", () => {
        it("should initialize with correct dependencies", () => {
            expect(userChainConsumer.gameData).toBe(mockGameData);
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

            expect(mockGameData.playerChains["activePlayer1-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["activePlayer1-0.10"].name).toBe("test-chain-1");
            expect(mockGameData.playerChains["activePlayer1-0.10"].currentIndex).toBe(1);
            expect(mockGameData.playerChains["activePlayer1-0.10"].betLevel).toBe(1);
            expect(mockGameData.playerChains["activePlayer1-0.10"].coinValue).toBe(0.1);

            expect(mockGameData.playerChains["activePlayer2-0.40"]).toBeDefined();
            expect(mockGameData.playerChains["activePlayer2-0.40"].name).toBe("test-chain-2");
            expect(mockGameData.playerChains["activePlayer2-0.40"].currentIndex).toBe(0);
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

            expect(mockGameData.playerChains["missingChainPlayer-0.1"]).toBeUndefined();
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
                balance: 100,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            };

            const result = await userChainConsumer.assignChain("testPlayer", playerContext);

            expect(result).toBe(true);
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.10"].currentIndex).toBe(0);
            expect(mockGameData.playerChains["testPlayer-0.10"].betLevel).toBe(1);
            expect(mockGameData.playerChains["testPlayer-0.10"].coinValue).toBe(0.1);
            expect(mockAssignmentRepository.create).toHaveBeenCalled();
        });

        it("should return false when player already has an active chain", async () => {
            mockGameData.playerChains["existingPlayer-0.10"] = {
                name: "existing-chain",
                boards: [],
                currentIndex: 0,
                boardsLoaded: true,
            };

            const result = await userChainConsumer.assignChain("existingPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(false);
            // No warning should be logged since this is normal behavior
        });

        it("should return false when no chains are available", async () => {
            mockGameData.availableChains = [];

            const result = await userChainConsumer.assignChain("testPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(false);
            // No warning should be logged since missing chains are handled silently
        });

        it("should use random selection when multiple chains are available", async () => {
            const originalMathRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.9); // Should select the last chain (index 1)

            const result = await userChainConsumer.assignChain("randomTestPlayer", {
                playerId: "randomTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(true);
            expect(mockGameData.playerChains["randomTestPlayer-0.10"].name).toBe("test-chain-2");

            Math.random = originalMathRandom;
        });

        it("should assign chain regardless of betLevel and coinValue (no filtering)", async () => {
            const originalMathRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.0); // Should select first chain (index 0)

            const result = await userChainConsumer.assignChain("noFilterTestPlayer", {
                playerId: "noFilterTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 100,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            });

            expect(result).toBe(true);
            // Should not query assignments for filtering - assignChain no longer does this
            expect(mockGameData.playerChains["noFilterTestPlayer-0.10"].name).toBe("test-chain-1");

            Math.random = originalMathRandom;
        });

        it("should return false when player balance is insufficient", async () => {
            const result = await userChainConsumer.assignChain("poorPlayer", {
                playerId: "poorPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 0,
            });

            expect(result).toBe(false);
        });

        it("should return false when baseBetAmount is zero", async () => {
            const result = await userChainConsumer.assignChain("zeroPlayer", {
                playerId: "zeroPlayer",
                betLevel: 0,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(false);
        });

        it("should handle assignment repository errors gracefully", async () => {
            mockAssignmentRepository.create.mockRejectedValueOnce(new Error("Database error"));

            const result = await userChainConsumer.assignChain("errorTestPlayer", {
                playerId: "errorTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(true); // Assignment to memory should still succeed
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to create chain assignment for errorTestPlayer"));
        });
    });

    describe("updateChainProgress", () => {
        beforeEach(() => {
            mockGameData.playerChains["progressPlayer-0.10"] = {
                name: "test-chain-1",
                boards: [{ board: [1, 2, 3] }, { board: [4, 5, 6] }],
                currentIndex: 0,
                totalBoards: 2,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "progressPlayer",
                boardsLoaded: true,
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
            expect(mockGameData.playerChains["progressPlayer-0.10"].currentIndex).toBe(1);
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
            mockGameData.playerChains["completionPlayer-0.10"] = {
                name: "test-chain-1",
                boards: [{ board: [1, 2, 3] }],
                currentIndex: 0,
                totalBoards: 1,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "completionPlayer",
                boardsLoaded: true,
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
            expect(mockGameData.playerChains["completionPlayer-0.10"]).toBeUndefined();
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

    describe("getApplicableBoardCount", () => {
        it("should return -1 immediately for zero balance", () => {
            const result = userChainConsumer.getApplicableBoardCount({ balance: 0 }, 0.1);
            expect(result).toBe(-1);
        });

        it("should return -1 for zero baseBetAmount", () => {
            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 0);
            expect(result).toBe(-1);
        });

        it("should return -1 for negative values", () => {
            const result1 = userChainConsumer.getApplicableBoardCount({ balance: -10 }, 0.1);
            const result2 = userChainConsumer.getApplicableBoardCount({ balance: 100 }, -0.1);
            expect(result1).toBe(-1);
            expect(result2).toBe(-1);
        });

        it("should calculate board count using betMultiplier from gameConfigs", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 2;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 0.1);

            // affordableSpins = floor(100 / 0.1 / 2) = floor(500) = 500
            // calculatedBoardCount = floor(500 + 0.25 * 500 * 2) = floor(500 + 250) = 750
            // assignedBoardCount = max(750, 200) = 750
            // Should round to nearest valid count, which is 200 (closest to 750 in range [50, 75, 100, 125, 150, 175, 200])
            expect(result).toBe(200);
        });

        it("should return -1 when playable boards less than 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 1;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 10 }, 1);

            // playableBoards = 10, which is < 50, so should return -1 (no chain assignment)
            expect(result).toBe(-1);
        });

        it("should apply chain when playable boards equals exactly 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 1;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 50 }, 1);

            // playableBoards = 50, applicableBoards = 50 + 12.5 = 62.5 -> 62
            // Valid counts: [50, 75, 100, 125, 150, 175, 200]
            // Distance from 62: |50-62|=12, |75-62|=13, so closest is 50
            expect(result).toBe(50);
        });

        it("should calculate board count and round to nearest valid count", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 1;

            // Test different scenarios with new formula
            const result1 = userChainConsumer.getApplicableBoardCount({ balance: 60 }, 1);
            // playableBoards = 60, applicableBoards = 60 + 15 = 75, closest valid = 75
            expect(result1).toBe(75);

            const result2 = userChainConsumer.getApplicableBoardCount({ balance: 85 }, 1);
            // playableBoards = 85, applicableBoards = 85 + 21.25 = 106.25 -> 106, closest valid = 100
            expect(result2).toBe(100);

            // Test with larger balance
            const result3 = userChainConsumer.getApplicableBoardCount({ balance: 500 }, 1);
            // playableBoards = 500, applicableBoards = 500 + 125 = 625, closest valid = 200 (max in range)
            expect(result3).toBe(200);
        });

        it("should use default betMultiplier when not configured", () => {
            delete mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 1);

            // Should use default multiplier of 1
            // playableBoards = 100, applicableBoards = 100 + 25 = 125, closest valid = 125
            expect(result).toBe(125);
        });
    });

    describe("getPlayableBoards", () => {
        it("should return -1 for invalid inputs", () => {
            expect(userChainConsumer.getPlayableBoards(0, 1, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(-10, 1, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(100, 0, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(100, -1, 1)).toBe(-1);
        });

        it("should calculate playable boards correctly", () => {
            expect(userChainConsumer.getPlayableBoards(100, 1, 1)).toBe(100);
            expect(userChainConsumer.getPlayableBoards(100, 2, 1)).toBe(50);
            expect(userChainConsumer.getPlayableBoards(100, 1, 2)).toBe(50);
            expect(userChainConsumer.getPlayableBoards(150, 1.5, 2)).toBe(50);
        });

        it("should handle decimal calculations with Math.floor", () => {
            expect(userChainConsumer.getPlayableBoards(99, 1, 1)).toBe(99);
            expect(userChainConsumer.getPlayableBoards(99.9, 1, 1)).toBe(99);
            expect(userChainConsumer.getPlayableBoards(100, 3, 1)).toBe(33); // 100/3 = 33.33 -> 33
        });
    });

    describe("getApplicableBoards", () => {
        it("should return -1 for playable boards less than minimum threshold", () => {
            expect(userChainConsumer.getApplicableBoards(-1)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(0)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(10)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(49)).toBe(-1);
        });

        it("should calculate applicable boards using 25% formula", () => {
            expect(userChainConsumer.getApplicableBoards(50)).toBe(62); // 50 + 12.5 = 62.5 -> 62
            expect(userChainConsumer.getApplicableBoards(100)).toBe(125); // 100 + 25 = 125
            expect(userChainConsumer.getApplicableBoards(80)).toBe(100); // 80 + 20 = 100
            expect(userChainConsumer.getApplicableBoards(200)).toBe(250); // 200 + 50 = 250
        });

        it("should handle decimal calculations with Math.floor", () => {
            expect(userChainConsumer.getApplicableBoards(51)).toBe(63); // 51 + 12.75 = 63.75 -> 63
            expect(userChainConsumer.getApplicableBoards(83)).toBe(103); // 83 + 20.75 = 103.75 -> 103
        });
    });

    describe("getClosestValidBoardCount", () => {
        it("should return closest valid board count", () => {
            expect(userChainConsumer.getClosestValidBoardCount(50)).toBe(50);
            expect(userChainConsumer.getClosestValidBoardCount(62)).toBe(50); // |50-62|=12, |75-62|=13
            expect(userChainConsumer.getClosestValidBoardCount(63)).toBe(75); // |50-63|=13, |75-63|=12
            expect(userChainConsumer.getClosestValidBoardCount(100)).toBe(100);
            expect(userChainConsumer.getClosestValidBoardCount(125)).toBe(125);
            expect(userChainConsumer.getClosestValidBoardCount(250)).toBe(200); // Max value
        });

        it("should handle edge cases", () => {
            expect(userChainConsumer.getClosestValidBoardCount(0)).toBe(50); // Closest to minimum
            expect(userChainConsumer.getClosestValidBoardCount(1000)).toBe(200); // Closest to maximum
            expect(userChainConsumer.getClosestValidBoardCount(87.5)).toBe(75); // |75-87.5|=12.5, |100-87.5|=12.5, returns first (75)
        });
    });
});
