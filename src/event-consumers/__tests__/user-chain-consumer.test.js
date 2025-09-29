import UserChainConsumer from "../user-chain-consumer";

// Mock data structures
const mockGameData = {
    gameConfigs: {
        gameId: "test-game-123",
        cascadingSlotsConfig: {
            betMultiplier: 20,
            resultChains: {
                enabled: true,
            },
        },
    },
    playerChains: {},
};

const mockLogService = {
    logWarning: jest.fn(),
    logError: jest.fn(),
};

const mockAppConfigs = {
    resultChains: {
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

const mockAssignmentRepository = {
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
        }),
    }),
    findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
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

        // Reset bet multiplier to realistic value
        mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

        // Ensure chains are enabled by default
        mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = true;

        // Reset repository mocks to default state
        mockAssignmentRepository.create.mockResolvedValue({ _id: "test-assignment-id" });
        mockAssignmentRepository.find.mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
            }),
        });
        mockAssignmentRepository.findOne.mockReturnValue({
            lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null), // No active assignment by default
            }),
        });

        userChainConsumer = new UserChainConsumer({
            gameData: mockGameData,
            assignmentRepository: mockAssignmentRepository,
            logService: mockLogService,
            appConfigs: mockAppConfigs,
        });
    });

    describe("constructor", () => {
        it("should initialize with correct dependencies", () => {
            expect(userChainConsumer.gameData).toBe(mockGameData);
            expect(userChainConsumer.assignmentRepository).toBe(mockAssignmentRepository);
            expect(userChainConsumer.logService).toBe(mockLogService);
        });
    });

    describe("loadActive", () => {
        it("should log error and return early when memoryExpirationMinutes is not configured", async () => {
            // Create consumer with missing memoryExpirationMinutes config
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    // memoryExpirationMinutes is missing
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            await consumerWithIncompleteConfig.loadActive();

            expect(mockLogService.logError).toHaveBeenCalledWith(
                expect.stringContaining("memoryExpirationMinutes or maxPlayerChains is not configured in appConfigs.resultChains")
            );
            expect(mockAssignmentRepository.find).not.toHaveBeenCalled();
        });

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

            mockAssignmentRepository.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(activeAssignments),
                        }),
                    }),
                }),
            });

            await userChainConsumer.loadActive();

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
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(activeAssignments),
                        }),
                    }),
                }),
            });

            await userChainConsumer.loadActive();

            expect(mockGameData.playerChains["missingChainPlayer-0.1"]).toBeUndefined();
            // No warning should be logged since missing chains are normal
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockRejectedValue(new Error("Database error")),
                        }),
                    }),
                }),
            });

            await userChainConsumer.loadActive();

            expect(mockLogService.logError).toHaveBeenCalledWith("Failed to load active chains:", expect.any(Error));
        });
    });

    describe("assignChain", () => {
        it("should assign chain to player successfully", async () => {
            const playerContext = {
                playerId: "player-123",
                betLevel: 1,
                coinValue: 0.1,
                balance: 120, // Will result in 75 applicable boards (within limit)
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

        it("should return false when chains are disabled", async () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;

            const result = await userChainConsumer.assignChain("testPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            });

            expect(result).toBe(false);
            expect(mockAssignmentRepository.create).not.toHaveBeenCalled();
        });

        it("should return false when player already has an active chain", async () => {
            mockGameData.playerChains["existingPlayer-0.10"] = {
                name: "existing-chain",
                currentIndex: 0,
                totalBoards: 100,
            };

            const result = await userChainConsumer.assignChain("existingPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            });

            expect(result).toBe(false);
            // No warning should be logged since this is normal behavior
        });

        it("should return false when player has active assignment in database", async () => {
            // Mock assignmentRepository to return an active assignment
            mockAssignmentRepository.findOne.mockReturnValueOnce({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        playerName: "existingPlayer",
                        betLevel: 1,
                        coinValue: 0.1,
                        status: "active",
                    }),
                }),
            });

            const result = await userChainConsumer.assignChain("existingPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            });

            expect(result).toBe(false);
            expect(mockAssignmentRepository.create).not.toHaveBeenCalled();
        });

        it("should return false when no chains are available", async () => {
            mockGameData.availableChains = [];

            const result = await userChainConsumer.assignChain("testPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
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
                balance: 120,
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
                balance: 120,
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
                balance: 120,
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
                    chainName: "test-chain-1",
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
        it("should log error and return -1 when chain configuration is missing", () => {
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    memoryExpirationMinutes: 30,
                    // Missing assignment configuration
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            const result = consumerWithIncompleteConfig.getApplicableBoardCount({ balance: 1000 }, 10);

            expect(result).toBe(-1);
            expect(mockLogService.logError).toHaveBeenCalledWith(
                expect.stringContaining("missing configuration in appConfigs.resultChains.assignment")
            );
        });

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
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 120 }, 0.1);

            // playableBoards = floor(120 / 0.1 / 20) = floor(60) = 60
            // applicableBoards = floor(60 + 15) = 75
            // 75 <= 100 (maximum), closest valid = 75
            expect(result).toBe(75);
        });

        it("should return -1 when playable boards less than 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 50 }, 0.1);

            // playableBoards = floor(50 / 0.1 / 20) = floor(25) = 25
            // Since 25 < 50 (minimum), should return -1
            expect(result).toBe(-1);
        });

        it("should apply chain when playable boards equals exactly 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 0.1);

            // playableBoards = floor(100 / 0.1 / 20) = floor(50) = 50
            // applicableBoards = floor(50 + 12.5) = 62
            // Valid counts: [50, 75, 100, 125, 150, 175, 200]
            // Distance from 62: |50-62|=12, |75-62|=13, so closest is 50
            expect(result).toBe(50);
        });

        it("should calculate board count and round to nearest valid count", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            // Test different scenarios with new formula
            const result1 = userChainConsumer.getApplicableBoardCount({ balance: 120 }, 0.1);
            // playableBoards = floor(120 / 0.1 / 20) = 60, applicableBoards = 75, closest valid = 75
            expect(result1).toBe(75);

            const result2 = userChainConsumer.getApplicableBoardCount({ balance: 160 }, 0.1);
            // playableBoards = floor(160 / 0.1 / 20) = 80, applicableBoards = 100, closest valid = 100
            expect(result2).toBe(100);

            // Test with larger balance
            const result3 = userChainConsumer.getApplicableBoardCount({ balance: 1000 }, 0.1);
            // playableBoards = floor(1000 / 0.1 / 20) = 500, applicableBoards = 625, closest valid = 200
            expect(result3).toBe(200);
        });

        it("should use default betMultiplier when not configured", () => {
            delete mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 80 }, 1);

            // Should use default multiplier of 1
            // playableBoards = floor(80 / 1 / 1) = 80, applicableBoards = 100, closest valid = 100
            expect(result).toBe(100);
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
        it("should return -1 when configuration is missing", () => {
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    memoryExpirationMinutes: 30,
                    // Missing assignment configuration
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            const result = consumerWithIncompleteConfig.getApplicableBoards(50);
            expect(result).toBe(-1);
            expect(mockLogService.logError).toHaveBeenCalledWith(
                expect.stringContaining("missing configuration in appConfigs.resultChains.assignment")
            );
        });

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

    describe("sortByActivity", () => {
        beforeEach(() => {
            const now = new Date();
            mockGameData.playerChains = {
                "player1-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1000), // 1 second ago
                    assignedAt: new Date(now.getTime() - 5000),
                },
                "player2-0.20": {
                    lastActivityAt: new Date(now.getTime() - 3000), // 3 seconds ago
                    assignedAt: new Date(now.getTime() - 4000),
                },
                "player3-0.30": {
                    // No lastActivityAt, should use assignedAt
                    assignedAt: new Date(now.getTime() - 2000), // 2 seconds ago
                },
            };
        });

        it("should sort chains by most recent activity first", () => {
            const chainKeys = ["player1-0.10", "player2-0.20", "player3-0.30"];
            const sorted = userChainConsumer.sortByActivity(chainKeys);

            // Expected order: player1 (1s ago) -> player3 (2s ago) -> player2 (3s ago)
            expect(sorted).toEqual(["player1-0.10", "player3-0.30", "player2-0.20"]);
        });

        it("should handle empty array", () => {
            const sorted = userChainConsumer.sortByActivity([]);
            expect(sorted).toEqual([]);
        });

        it("should handle single item", () => {
            const sorted = userChainConsumer.sortByActivity(["player1-0.10"]);
            expect(sorted).toEqual(["player1-0.10"]);
        });

        it("should fallback to assignedAt when lastActivityAt is missing", () => {
            const now = new Date();
            mockGameData.playerChains = {
                "player1-0.10": {
                    assignedAt: new Date(now.getTime() - 1000), // 1 second ago
                },
                "player2-0.20": {
                    assignedAt: new Date(now.getTime() - 3000), // 3 seconds ago
                },
            };

            const sorted = userChainConsumer.sortByActivity(["player1-0.10", "player2-0.20"]);
            expect(sorted).toEqual(["player1-0.10", "player2-0.20"]);
        });
    });

    describe("limitPerPlayer", () => {
        beforeEach(() => {
            const now = new Date();
            mockGameData.playerChains = {
                "testPlayer-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1000),
                    assignedAt: new Date(now.getTime() - 5000),
                },
                "testPlayer-0.20": {
                    lastActivityAt: new Date(now.getTime() - 3000),
                    assignedAt: new Date(now.getTime() - 4000),
                },
                "testPlayer-0.30": {
                    lastActivityAt: new Date(now.getTime() - 2000),
                    assignedAt: new Date(now.getTime() - 3000),
                },
                "otherPlayer-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1500),
                    assignedAt: new Date(now.getTime() - 2000),
                },
                "otherPlayer-0.20": {
                    lastActivityAt: new Date(now.getTime() - 4000),
                    assignedAt: new Date(now.getTime() - 6000),
                },
                "otherPlayer-0.30": {
                    lastActivityAt: new Date(now.getTime() - 5000),
                    assignedAt: new Date(now.getTime() - 7000),
                },
            };
        });

        it("should not remove chains when all players have less than limit", () => {
            // Remove chains to have only 1 per player
            delete mockGameData.playerChains["testPlayer-0.20"];
            delete mockGameData.playerChains["testPlayer-0.30"];
            delete mockGameData.playerChains["otherPlayer-0.20"];
            delete mockGameData.playerChains["otherPlayer-0.30"];

            userChainConsumer.limitPerPlayer();

            // Should not affect existing chains
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(2);
        });

        it("should remove oldest chains when players exceed limit", () => {
            userChainConsumer.limitPerPlayer();

            // Should keep only 2 most recent chains per player
            const testPlayerChains = Object.keys(mockGameData.playerChains).filter((key) => key.startsWith("testPlayer-"));
            const otherPlayerChains = Object.keys(mockGameData.playerChains).filter((key) => key.startsWith("otherPlayer-"));

            expect(testPlayerChains).toHaveLength(2);
            expect(otherPlayerChains).toHaveLength(2);

            // Should keep most recent for testPlayer: testPlayer-0.10 (1s ago) and testPlayer-0.30 (2s ago)
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.30"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.20"]).toBeUndefined(); // Oldest (3s ago)

            // Should keep most recent for otherPlayer: otherPlayer-0.10 (1.5s ago) and otherPlayer-0.20 (4s ago)
            expect(mockGameData.playerChains["otherPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.20"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.30"]).toBeUndefined(); // Oldest (5s ago)
        });

        it("should handle players with exactly the limit", () => {
            // Remove one chain per player to have exactly 2 each
            delete mockGameData.playerChains["testPlayer-0.30"];
            delete mockGameData.playerChains["otherPlayer-0.30"];

            userChainConsumer.limitPerPlayer();

            // Should keep both chains for each player
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.20"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.20"]).toBeDefined();
        });
    });

    describe("clean", () => {
        it("should return early when memoryExpirationMinutes is not configured", () => {
            // Create consumer with missing memoryExpirationMinutes config
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    // memoryExpirationMinutes is missing
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            // Should not throw an error, just return early
            expect(() => consumerWithIncompleteConfig.clean()).not.toThrow();
        });

        beforeEach(() => {
            const now = new Date();
            const expiredTime = now.getTime() - 31 * 60 * 1000; // 31 minutes ago (expired)
            const recentTime = now.getTime() - 10 * 60 * 1000; // 10 minutes ago (not expired)

            mockGameData.playerChains = {
                "expired1-0.10": {
                    lastActivityAt: new Date(expiredTime),
                    assignedAt: new Date(expiredTime),
                },
                "expired2-0.20": {
                    assignedAt: new Date(expiredTime), // No lastActivityAt, uses assignedAt
                },
                "recent1-0.10": {
                    lastActivityAt: new Date(recentTime),
                    assignedAt: new Date(recentTime),
                },
                "recent2-0.20": {
                    lastActivityAt: new Date(recentTime),
                    assignedAt: new Date(recentTime),
                },
            };
        });

        it("should remove expired chains", () => {
            userChainConsumer.clean();

            expect(mockGameData.playerChains["expired1-0.10"]).toBeUndefined();
            expect(mockGameData.playerChains["expired2-0.20"]).toBeUndefined();
            expect(mockGameData.playerChains["recent1-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["recent2-0.20"]).toBeDefined();
        });

        it("should enforce global cache limit after cleaning expired chains", () => {
            // Create many non-expired chains to exceed global limit
            const now = new Date();
            const recentTime = now.getTime() - 10 * 60 * 1000;

            // Clear existing chains and create 302 chains (exceeds limit of 300)
            mockGameData.playerChains = {};
            for (let i = 0; i < 302; i++) {
                mockGameData.playerChains[`player${i}-0.10`] = {
                    lastActivityAt: new Date(recentTime - i * 1000), // Different times for sorting
                    assignedAt: new Date(recentTime - i * 1000),
                };
            }

            userChainConsumer.clean();

            // Should keep only 300 most recent chains
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(300);

            // Should keep the most recent ones (player0, player1, etc.)
            expect(mockGameData.playerChains["player0-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["player299-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["player300-0.10"]).toBeUndefined();
            expect(mockGameData.playerChains["player301-0.10"]).toBeUndefined();
        });

        it("should not enforce global limit when under threshold", () => {
            userChainConsumer.clean();

            // Should only remove expired chains, keep recent ones
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(2);
            expect(mockGameData.playerChains["recent1-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["recent2-0.20"]).toBeDefined();
        });
    });

    describe("findSuitable", () => {
        it("should return null when applicable board count is -1", async () => {
            const playerContext = {
                betLevel: 1,
                coinValue: 0.1,
                balance: 0, // Will result in -1 applicable board count
            };

            const result = await userChainConsumer.findSuitable(playerContext);
            expect(result).toBeNull();
        });

        it("should return null when no matching chains available", async () => {
            mockGameData.availableChains = [
                { name: "chain1", totalBoardCount: 200 }, // Too many boards
            ];

            const playerContext = {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120, // Will result in ~75 applicable boards
            };

            const result = await userChainConsumer.findSuitable(playerContext);
            expect(result).toBeNull();
        });

        it("should return selected chain when matching chains exist", async () => {
            const originalMathRandom = Math.random;
            Math.random = jest.fn().mockReturnValue(0.0); // Select first chain

            const playerContext = {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120, // Will result in 75 applicable boards
            };

            const result = await userChainConsumer.findSuitable(playerContext);
            expect(result).toEqual({
                name: "test-chain-1",
                baseBetAmount: 0.1,
                totalBoardCount: 75,
            });

            Math.random = originalMathRandom;
        });

        it("should handle empty available chains", async () => {
            mockGameData.availableChains = [];

            const playerContext = {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            };

            const result = await userChainConsumer.findSuitable(playerContext);
            expect(result).toBeNull();
        });
    });

    describe("storeAssignment", () => {
        it("should store chain in memory and database successfully", async () => {
            const chainKey = "testPlayer-0.10";
            const selectedChain = { name: "test-chain-1", baseBetAmount: 0.1, totalBoardCount: 75 };
            const boards = [{ board: [1, 2, 3] }, { board: [4, 5, 6] }];
            const playerContext = {
                playerId: "player-123",
                betLevel: 1,
                coinValue: 0.1,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            };
            const playerName = "testPlayer";

            await userChainConsumer.storeAssignment(chainKey, selectedChain, playerContext, playerName);

            // Check memory storage
            expect(mockGameData.playerChains[chainKey]).toBeDefined();
            expect(mockGameData.playerChains[chainKey].name).toBe("test-chain-1");
            expect(mockGameData.playerChains[chainKey].currentIndex).toBe(0);
            expect(mockGameData.playerChains[chainKey].totalBoards).toBe(selectedChain.totalBoardCount);

            // Check database storage
            expect(mockAssignmentRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    playerId: "player-123",
                    playerName: "testPlayer",
                    chainName: "test-chain-1",
                    currentBoardIndex: 0,
                    totalBoards: 75,
                    betLevel: 1,
                    coinValue: 0.1,
                    status: "active",
                })
            );
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.create.mockRejectedValueOnce(new Error("Database error"));

            const chainKey = "errorPlayer-0.10";
            const selectedChain = { name: "test-chain-1", baseBetAmount: 0.1, totalBoardCount: 75 };
            const boards = [{ board: [1, 2, 3] }];
            const playerContext = { playerId: "player-123", betLevel: 1, coinValue: 0.1 };
            const playerName = "errorPlayer";

            await userChainConsumer.storeAssignment(chainKey, selectedChain, playerContext, playerName);

            // Memory storage should still work
            expect(mockGameData.playerChains[chainKey]).toBeDefined();

            // Error should be logged
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to create chain assignment for"));
        });
    });
});
